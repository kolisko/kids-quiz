import org.gradle.api.file.DuplicatesStrategy
import org.gradle.jvm.tasks.Jar
import org.gradle.jvm.toolchain.JavaLanguageVersion
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ktor)
    application
}

group = "com.example.quiz"
version = "1.0-SNAPSHOT"

application {
    mainClass.set("com.example.quiz.ApplicationKt")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_21)
    }
}

dependencies {
    implementation(project(":backend:domain"))
    implementation(project(":backend:application"))
    implementation(project(":backend:adapters"))
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.netty)
    implementation(libs.ktor.server.content.negotiation)
    implementation(libs.ktor.server.cors)
    implementation(libs.ktor.server.routing.openapi)
    implementation(libs.ktor.server.status.pages)
    implementation(libs.ktor.server.swagger)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.kotlinx.serialization.json)
    runtimeOnly(libs.logback.classic)
    testImplementation(kotlin("test"))
}

ktor {
    openApi {
        enabled = true
        codeInferenceEnabled = true
        onlyCommented = false
    }
}

tasks.named<Jar>("jar") {
    archiveFileName.set("kids-quiz-backend.jar")
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
    manifest {
        attributes["Main-Class"] = application.mainClass.get()
    }
    exclude("META-INF/*.DSA", "META-INF/*.RSA", "META-INF/*.SF")
    from(
        configurations.runtimeClasspath.map { runtimeClasspath ->
            runtimeClasspath
                .filter { it.name.endsWith(".jar") }
                .map { zipTree(it) }
        },
    )
}

tasks.test {
    useJUnitPlatform()
}
