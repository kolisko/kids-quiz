import com.varabyte.kobweb.gradle.application.util.configAsKobwebApplication
import kotlinx.html.link
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.jetbrains.compose)
    alias(libs.plugins.kobweb.application)
}

group = "com.example.quiz"
version = "1.0-SNAPSHOT"

kotlin {
    configAsKobwebApplication()
    jvm {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_21)
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.serialization.json)
        }

        jsMain.dependencies {
            implementation(libs.compose.html.core)
            implementation(libs.compose.runtime)
            implementation(libs.kobweb.core)
            implementation(libs.kobweb.silk)
            implementation(libs.kotlinx.coroutines.core)
        }

        jvmMain.dependencies {
            implementation(libs.kobweb.api)
            implementation(libs.kotlinx.serialization.json)
        }
    }
}

kobweb {
    app {
        index {
            description.set("Detska kvízova hra s casovym limitem, bodovanim a zviratkovymi gratulacemi.")
            head.add {
                link(rel = "stylesheet", href = "/styles.css")
            }
        }
    }
}
