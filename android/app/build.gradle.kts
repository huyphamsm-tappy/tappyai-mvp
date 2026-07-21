plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    // Needed because AppRoute.kt (Phase 1B) declares @Serializable route types directly in
    // this module, for Navigation Compose's type-safe destination API — same reason
    // features:auth already applies this plugin for its own AuthRoute types.
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.tappyai.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tappyai.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        vectorDrawables {
            useSupportLibrary = true
        }

        // Phase 1B: one Supabase project shared across variants (matching the web app's own
        // single-project setup — no evidence of separate staging/prod Supabase projects).
        // Placeholders below are NOT real values — supply real ones via
        // `-PTAPPYAI_SUPABASE_URL=... -PTAPPYAI_SUPABASE_ANON_KEY=... -PTAPPYAI_GOOGLE_WEB_CLIENT_ID=...`
        // (gradle.properties or CLI), same override pattern as `API_BASE_URL` below. No login
        // will complete without these — see the plan's M9 verification note.
        buildConfigField(
            "String", "SUPABASE_URL",
            "\"${project.findProperty("TAPPYAI_SUPABASE_URL") ?: "https://your-project.supabase.co"}\""
        )
        buildConfigField(
            "String", "SUPABASE_ANON_KEY",
            "\"${project.findProperty("TAPPYAI_SUPABASE_ANON_KEY") ?: "REPLACE_WITH_SUPABASE_ANON_KEY"}\""
        )
        // Google Cloud OAuth 2.0 "Web application"-type client ID (not the Android-type one) —
        // Credential Manager's native Google Sign-In requires this specific type as the
        // `serverClientId`, and it must match whatever client ID Supabase's Google provider is
        // configured with server-side.
        buildConfigField(
            "String", "GOOGLE_WEB_CLIENT_ID",
            "\"${project.findProperty("TAPPYAI_GOOGLE_WEB_CLIENT_ID") ?: "REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com"}\""
        )
        // Public web origin used to build shareable Group Dining links (`<origin>/group/{id}`) —
        // the same value as the web app's NEXT_PUBLIC_APP_URL. Distinct from API_BASE_URL (which is
        // the emulator loopback in debug and not a shareable public URL). Supply the real origin via
        // `-PTAPPYAI_WEB_APP_URL=https://...` (no trailing slash); the placeholder below only affects
        // the copied/shared link text, not any request. Applies to all variants.
        buildConfigField(
            "String", "WEB_APP_URL",
            "\"${project.findProperty("TAPPYAI_WEB_APP_URL") ?: "https://tappyai.example.com"}\""
        )
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            isMinifyEnabled = false
            isDebuggable = true
            // Emulator's host-loopback by default (local dev server on :3000). A physical-device QA
            // build overrides this with the real backend via -PTAPPYAI_API_BASE_URL_DEBUG=<url>,
            // the same findProperty override pattern staging/release use — no new config system.
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"${project.findProperty("TAPPYAI_API_BASE_URL_DEBUG") ?: "http://10.0.2.2:3000/"}\""
            )
        }
        create("staging") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            isMinifyEnabled = true
            isShrinkResources = true
            isDebuggable = true
            matchingFallbacks += listOf("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"${project.findProperty("TAPPYAI_API_BASE_URL_STAGING") ?: "https://staging.tappyai.example.com/"}\""
            )
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            isDebuggable = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"${project.findProperty("TAPPYAI_API_BASE_URL_RELEASE") ?: "https://tappyai.example.com/"}\""
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:common"))
    implementation(project(":core:logging"))
    implementation(project(":core:analytics"))
    implementation(project(":core:featureflags"))
    implementation(project(":core:network-monitor"))
    implementation(project(":core:navigation"))
    implementation(project(":core:deeplink"))
    implementation(project(":core:datastore"))
    implementation(project(":core:security"))
    implementation(project(":core:network"))
    implementation(project(":core:database"))
    implementation(project(":features:auth"))

    // Real build error found during Phase 1B.1: AppRoute.kt uses @Serializable but this module
    // only applied the kotlin-serialization compiler plugin, never the runtime library the
    // annotation itself comes from — "Unresolved reference 'serialization'".
    implementation(libs.kotlinx.serialization.json)
    // OkHttp is implementation (non-transitive) in core:network, so RealChatRepository needs
    // it declared directly here to use OkHttpClient, Request, and RequestBody on the compile
    // classpath.
    implementation(libs.okhttp.core)
    // Retrofit is likewise non-transitive from core:network — the Reviews feature declares the
    // ReviewsApi interface (retrofit2.http annotations) and calls retrofit.create() in its Hilt
    // module, so it needs Retrofit on its own compile classpath.
    implementation(libs.retrofit.core)
    // QR generation for the Profile "QR profile" sheet — encoder-only, no camera/scanning.
    implementation(libs.zxing.core)
    // Real audio playback for the Music feature — the AudioPlayer seam's ExoPlayer implementation.
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.common)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)
    ksp(libs.androidx.hilt.compiler)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    // Needed directly here (not just transitively through :core:designsystem, which depends
    // on it as `implementation` and therefore doesn't expose it downstream) because the
    // showcase screen references extended icons (e.g. SearchOff) directly.
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
