import org.gradle.api.tasks.Sync
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

plugins {
    base
}

val kidsQuizImage = providers.gradleProperty("kidsQuizImage").orElse("kids-quiz:latest")
val kidsQuizPlatform = providers.gradleProperty("kidsQuizPlatform").orElse("linux/amd64")
val kidsQuizHost = providers.gradleProperty("kidsQuizHost").orElse("contabo")
val kidsQuizRemoteRoot = providers.gradleProperty("kidsQuizRemoteRoot").orElse("/opt/kids-quiz")
val kidsQuizDomain = providers.gradleProperty("kidsQuizDomain").orElse("beatka.duckdns.org")
val kidsQuizExtraDomains = providers.gradleProperty("kidsQuizExtraDomains").orElse("beatka.207-180-242-157.sslip.io")

val deployDir = layout.buildDirectory.dir("deploy")
val imageContextDir = deployDir.map { it.dir("image-context") }
val remoteFilesDir = deployDir.map { it.dir("remote") }
val frontendDir = layout.projectDirectory.dir("frontend")
val frontendDistDir = frontendDir.dir("dist/kids-quiz/browser")
val snapshotFormatter = DateTimeFormatter.ofPattern("yyyyMMdd-HHmm").withZone(ZoneOffset.UTC)
val snapshotNumber = providers.provider { snapshotFormatter.format(Instant.now()) }

tasks.register<Exec>("frontendNpmInstall") {
    group = "build"
    description = "Installs Angular frontend dependencies."

    workingDir(frontendDir)
    commandLine("npm", "ci")
}

tasks.register<Exec>("frontendBuild") {
    group = "build"
    description = "Builds the Angular frontend."

    dependsOn("frontendNpmInstall")
    workingDir(frontendDir)
    commandLine("npm", "run", "build")
}

tasks.register<Sync>("stageDockerImageContext") {
    group = "deployment"
    description = "Stages the Kotlin backend jar and Angular static files for the runtime Docker image."

    dependsOn("frontendBuild", ":backend:jar")

    into(imageContextDir)

    from("deploy/Dockerfile.runtime") {
        rename { "Dockerfile" }
    }
    from("deploy/docker-entrypoint.sh")
    from(layout.projectDirectory.file("backend/build/libs/kids-quiz-backend.jar")) {
        rename { "app.jar" }
    }
    from(frontendDistDir) {
        into("public")
    }
    doLast {
        imageContextDir.get().file("public/snapshot.txt").asFile.writeText("${snapshotNumber.get()}\n")
    }
}

tasks.register<Exec>("buildDockerImage") {
    group = "deployment"
    description = "Builds the app Docker image from staged runtime artifacts."

    dependsOn("stageDockerImageContext")

    doFirst {
        commandLine(
            "docker",
            "build",
            "--platform",
            kidsQuizPlatform.get(),
            "-t",
            kidsQuizImage.get(),
            imageContextDir.get().asFile.absolutePath,
        )
    }
}

tasks.register<Exec>("pushDockerImage") {
    group = "deployment"
    description = "Pushes the app Docker image to its configured registry."

    dependsOn("buildDockerImage")

    doFirst {
        commandLine("docker", "push", kidsQuizImage.get())
    }
}

tasks.register<Sync>("stageRemoteDeployFiles") {
    group = "deployment"
    description = "Stages non-secret remote deployment files."

    into(remoteFilesDir)
    from("deploy/docker-compose.yml")
}

tasks.register<Exec>("prepareRemoteDeployDir") {
    group = "deployment"
    description = "Creates the remote runtime directories on the VPS."

    doFirst {
        val root = kidsQuizRemoteRoot.get()
        commandLine(
            "ssh",
            kidsQuizHost.get(),
            "set -e; mkdir -p '$root/deploy' '$root/data/backups'; chmod 700 '$root/data'",
        )
    }
}

tasks.register<Exec>("configureRemoteCaddy") {
    group = "deployment"
    description = "Writes the reverse proxy Caddyfile on the VPS. App auth is handled by the app container."

    doFirst {
        val root = kidsQuizRemoteRoot.get()
        val domain = kidsQuizDomain.get()
        val extraDomains = kidsQuizExtraDomains.get().trim()
        val addresses = if (extraDomains.isBlank()) domain else "$domain, $extraDomains"
        val remoteScript = """
            set -e
            mkdir -p '$root'
            cat > '$root/Caddyfile' <<CADDY_EOF
            $addresses {
                header Cache-Control "no-store"
                reverse_proxy app:8080
            }
            CADDY_EOF
            chmod 600 '$root/Caddyfile'
            printf 'Wrote %s/Caddyfile.\n' '$root'
        """.trimIndent()

        commandLine("ssh", kidsQuizHost.get(), remoteScript)
    }
}

tasks.register<Exec>("uploadRemoteDeployFiles") {
    group = "deployment"
    description = "Uploads only the Compose file to the VPS."

    dependsOn("prepareRemoteDeployDir", "stageRemoteDeployFiles")

    doFirst {
        val target = "${kidsQuizHost.get()}:${kidsQuizRemoteRoot.get()}/deploy/"
        commandLine(
            "scp",
            remoteFilesDir.get().file("docker-compose.yml").asFile.absolutePath,
            target,
        )
    }
}

tasks.register<Exec>("deployRemoteImage") {
    group = "deployment"
    description = "Pulls the configured registry image on the VPS, migrates the DB, and restarts Compose."

    dependsOn("uploadRemoteDeployFiles")

    doFirst {
        val root = kidsQuizRemoteRoot.get()
        val image = kidsQuizImage.get()
        commandLine(
            "ssh",
            kidsQuizHost.get(),
            """
            set -e
            cd '$root/deploy'
            touch .env
            chmod 600 .env
            if grep -q '^KIDS_QUIZ_IMAGE=' .env; then
                sed -i 's|^KIDS_QUIZ_IMAGE=.*|KIDS_QUIZ_IMAGE=$image|' .env
            else
                printf '\nKIDS_QUIZ_IMAGE=%s\n' '$image' >> .env
            fi
            if ! grep -q '^KIDS_QUIZ_AUTH_COOKIE_SECURE=' .env; then
                printf 'KIDS_QUIZ_AUTH_COOKIE_SECURE=true\n' >> .env
            fi
            mkdir -p '$root/data/backups'
            if [ -f '$root/data/kids-quiz.sqlite' ]; then
                cp -p '$root/data/kids-quiz.sqlite' '$root/data/backups/kids-quiz.sqlite.pre-deploy-'${'$'}(date -u +%Y%m%d%H%M%S)'.bak'
            fi
            docker compose -p kids-quiz pull app
            docker compose -p kids-quiz run --interactive=false -T --rm app migrate
            docker compose -p kids-quiz rm -sf app caddy
            docker compose -p kids-quiz up -d app caddy
            running_image="${'$'}(docker inspect kids-quiz-app-1 --format '{{.Config.Image}}')"
            if [ "${'$'}running_image" != "$image" ]; then
                printf 'Expected app image %s, but container is running %s\n' "$image" "${'$'}running_image" >&2
                docker compose -p kids-quiz ps
                exit 1
            fi
            """.trimIndent(),
        )
    }
}

tasks.register("deployToContabo") {
    group = "deployment"
    description = "Configures Caddy, uploads Compose, pulls the registry image, migrates DB, and starts Compose on the VPS."

    dependsOn("configureRemoteCaddy", "deployRemoteImage")
}

tasks.named("deployRemoteImage") {
    mustRunAfter("configureRemoteCaddy")
}
