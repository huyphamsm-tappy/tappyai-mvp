// e2e-only stand-in for Zalo / TikTok: receives ACTION_SEND and logs what arrived (tag E2E_SHARE).
// Built only on demand (`gradlew :e2e:share-stub:assembleZaloDebug :e2e:share-stub:assembleTiktokDebug`);
// no module depends on it and it is never part of the app.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.tappyai.e2e.sharestub"
    compileSdk = 36
    defaultConfig {
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "e2e"
    }
    flavorDimensions += "target"
    productFlavors {
        create("zalo") { dimension = "target"; applicationId = "com.zing.zalo"; resValue("string", "stub_label", "E2E Zalo") }
        create("tiktok") { dimension = "target"; applicationId = "com.zhiliaoapp.musically"; resValue("string", "stub_label", "E2E TikTok") }
        create("messenger") { dimension = "target"; applicationId = "com.facebook.orca"; resValue("string", "stub_label", "E2E Messenger") }
    }
    buildFeatures { resValues = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
