import org.gradle.api.tasks.Sync

plugins {
    base
}

val kidsQuizImage = providers.gradleProperty("kidsQuizImage").orElse("kids-quiz:latest")
val kidsQuizPlatform = providers.gradleProperty("kidsQuizPlatform").orElse("linux/amd64")
val kidsQuizHost = providers.gradleProperty("kidsQuizHost").orElse("contabo")
val kidsQuizRemoteRoot = providers.gradleProperty("kidsQuizRemoteRoot").orElse("/opt/kids-quiz")
val kidsQuizDomain = providers.gradleProperty("kidsQuizDomain").orElse("beatka.duckdns.org")

val deployDir = layout.buildDirectory.dir("deploy")
val imageContextDir = deployDir.map { it.dir("image-context") }
val remoteFilesDir = deployDir.map { it.dir("remote") }
val imageTar = deployDir.map { it.file("kids-quiz.image.tar") }

tasks.register<Exec>("kobwebReleaseExport") {
    group = "deployment"
    description = "Builds the Kobweb fullstack release export locally."

    commandLine(
        "./gradlew",
        ":site:kobwebExport",
        "-PkobwebReuseServer=true",
        "-PkobwebEnv=DEV",
        "-PkobwebRunLayout=FULLSTACK",
        "-PkobwebBuildTarget=RELEASE",
        "-PkobwebExportLayout=FULLSTACK",
        "--no-daemon",
    )
}

tasks.register<Sync>("stageDockerImageContext") {
    group = "deployment"
    description = "Stages only runtime artifacts needed to build the Docker image."

    dependsOn("kobwebReleaseExport")

    into(imageContextDir)

    from("deploy/Dockerfile.runtime") {
        rename { "Dockerfile" }
    }

    from("site/.kobweb") {
        into(".kobweb")
        exclude("server/logs/**")
        exclude("server/state.yaml")
    }

    from("site/build/dist") {
        into("build/dist")
    }

    doLast {
        val root = imageContextDir.get().asFile
        val oldScriptName = "com-example-quiz.js"
        val newScriptName = "kids-quiz-app.js"
        val devScript = project.file("site/build/kotlin-webpack/js/developmentExecutable/$oldScriptName")
        val systemDir = root.resolve(".kobweb/site/system")
        val oldScript = systemDir.resolve(oldScriptName)
        val newScript = systemDir.resolve(newScriptName)
        val distDir = root.resolve("build/dist/js/productionExecutable")
        val oldDistScript = distDir.resolve(oldScriptName)
        val newDistScript = distDir.resolve(newScriptName)

        fun copyScript(source: File, target: File) {
            source.copyTo(target, overwrite = true)
            target.writeText(
                target.readText().replace(
                    "sourceMappingURL=$oldScriptName.map",
                    "sourceMappingURL=$newScriptName.map",
                ),
            )
        }

        if (oldScript.exists()) {
            copyScript(if (devScript.exists()) devScript else oldScript, newScript)
            systemDir.resolve("$oldScriptName.map")
                .takeIf { it.exists() }
                ?.copyTo(systemDir.resolve("$newScriptName.map"), overwrite = true)
        }

        if (oldDistScript.exists()) {
            copyScript(if (devScript.exists()) devScript else oldDistScript, newDistScript)
            distDir.resolve("$oldScriptName.map")
                .takeIf { it.exists() }
                ?.copyTo(distDir.resolve("$newScriptName.map"), overwrite = true)
        }

        listOf(
            root.resolve(".kobweb/conf.yaml"),
            root.resolve(".kobweb/site/pages/index.html"),
            root.resolve(".kobweb/site/system/index.html"),
            root.resolve("build/dist/js/productionExecutable/public/index.html"),
        ).filter { it.exists() }.forEach { htmlFile ->
            htmlFile.writeText(
                htmlFile.readText().replace(
                    "/$oldScriptName",
                    "/$newScriptName",
                ),
            )
        }
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

tasks.register<Exec>("saveDockerImage") {
    group = "deployment"
    description = "Saves the app Docker image as build/deploy/kids-quiz.image.tar."

    dependsOn("buildDockerImage")

    doFirst {
        imageTar.get().asFile.parentFile.mkdirs()
        commandLine(
            "docker",
            "save",
            "-o",
            imageTar.get().asFile.absolutePath,
            kidsQuizImage.get(),
        )
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
            "set -e; mkdir -p '$root/deploy' '$root/data'; chmod 700 '$root/data'; rmdir '$root/src' 2>/dev/null || true",
        )
    }
}

tasks.register<Exec>("configureRemoteCaddy") {
    group = "deployment"
    description = "Writes the reverse proxy Caddyfile on the VPS. App auth is handled by the app container."

    doFirst {
        val root = kidsQuizRemoteRoot.get()
        val domain = kidsQuizDomain.get()
        val remoteScript = """
            set -e
            mkdir -p '$root'
            cat > '$root/Caddyfile' <<CADDY_EOF
            $domain {
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

tasks.register<Exec>("uploadDockerImage") {
    group = "deployment"
    description = "Uploads the saved app image and Compose files to the VPS."

    dependsOn("prepareRemoteDeployDir", "saveDockerImage", "stageRemoteDeployFiles")

    doFirst {
        val target = "${kidsQuizHost.get()}:${kidsQuizRemoteRoot.get()}/deploy/"
        commandLine(
            "scp",
            imageTar.get().asFile.absolutePath,
            remoteFilesDir.get().file("docker-compose.yml").asFile.absolutePath,
            target,
        )
    }
}

tasks.register<Exec>("deployDockerImage") {
    group = "deployment"
    description = "Loads the uploaded image on the VPS and starts Docker Compose."

    dependsOn("uploadDockerImage")

    doFirst {
        val root = kidsQuizRemoteRoot.get()
        commandLine(
            "ssh",
            kidsQuizHost.get(),
            "set -e; docker load -i '$root/deploy/kids-quiz.image.tar'; cd '$root/deploy'; docker compose -p kids-quiz up -d",
        )
    }
}

tasks.register("deployToContabo") {
    group = "deployment"
    description = "Configures Caddy, uploads the app image tar, loads it, and starts Compose on the VPS."

    dependsOn("configureRemoteCaddy", "deployDockerImage")
}

tasks.named("deployDockerImage") {
    mustRunAfter("configureRemoteCaddy")
}
