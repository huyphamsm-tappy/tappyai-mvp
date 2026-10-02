plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.tappyai.core.analytics"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(project(":core:logging"))
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    // Firebase Analytics — the one real AnalyticsProvider. BOM-managed (the version
    // comes from the app's firebase-bom); the google-services plugin stays in the
    // app module, which owns google-services.json.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.analytics.ktx)

    testImplementation(libs.junit)
}
