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

// e2e only: stand-in share targets (com.zing.zalo, com.zhiliaoapp.musically) that log the intent they
// receive, so android/e2e can prove what a share hands to Zalo / TikTok. Never shipped, never depended on.
include(":e2e:share-stub")
