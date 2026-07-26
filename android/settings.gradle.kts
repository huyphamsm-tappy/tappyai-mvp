pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "TappyAI"

include(":app")
include(":core:designsystem")
include(":core:common")
include(":core:logging")
include(":core:analytics")
include(":core:featureflags")
include(":core:network-monitor")
include(":core:navigation")
include(":core:deeplink")
include(":core:datastore")
include(":core:security")
include(":core:network")
include(":core:database")
include(":features:auth")
