pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
        google()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_PROJECT)
    repositories {
        mavenCentral()
        google()
    }
}

rootProject.name = "kids-quiz"
include(":backend")
include(":backend:domain")
include(":backend:application")
include(":backend:adapters")
include(":backend:server")
