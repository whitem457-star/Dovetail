// Maven Central can rate-limit shared build machines (HTTP 429). Google's official mirror of
// Maven Central is listed first so builds don't depend on that; google() and the Gradle Plugin
// Portal are unchanged.
val mavenCentralMirror = "https://maven-central.storage-download.googleapis.com/maven2/"

pluginManagement {
    repositories {
        google()
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        maven(mavenCentralMirror)
        mavenCentral()
    }
}

rootProject.name = "Payday"
include(":app")
