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
        // Public web origin — the same value as the web app's NEXT_PUBLIC_APP_URL. Used for
        // shareable Group Dining links (`<origin>/group/{id}`), QR profile URLs, and the Games
        // WebView (`<origin>/games/supertux`). Distinct from API_BASE_URL (which is the emulator
        // loopback in debug and not a public origin). Override with
        // `-PTAPPYAI_WEB_APP_URL=https://...` (no trailing slash).
        //
        // The default is the REAL production origin, not a placeholder. It used to be
        // `https://tappyai.example.com`, which does not resolve (example.com is IANA-reserved and
        // delegates no subdomains): any debug build made without the property loaded
        // `https://tappyai.example.com/games/supertux` and the WebView failed the main frame with
        // net::ERR_NAME_NOT_RESOLVED, surfacing as "Couldn't load the game — check your connection"
        // with a retry that could never succeed. Sharing/QR were silently broken the same way.
        // Unlike API_BASE_URL there is no meaningful per-variant value here (a localhost origin is
        // not shareable and does not serve the game), so a wrong default has no upside and one
        // real default is correct for every variant. `assembleRelease`/`bundleRelease` still hard-
        // gate on the property being supplied explicitly (see the release check below), so this
        // default can never silently reach a store build.
        buildConfigField(
            "String", "WEB_APP_URL",
            "\"${project.findProperty("TAPPYAI_WEB_APP_URL") ?: "https://www.tappyai.com"}\""
        )
    }

    // Release signing (Production Readiness Sprint) — no signingConfigs block existed at all
    // before this, which is a hard Play Store submission blocker (an unsigned release build
    // can't be uploaded). Safe when absent: with none of the four properties supplied,
    // signingConfigs stays empty and `release` builds exactly as it did before (unsigned,
    // installable only after a separate signing step) — this only activates once real values are
    // supplied via `-PTAPPYAI_RELEASE_KEYSTORE_PATH=... -PTAPPYAI_RELEASE_KEYSTORE_PASSWORD=...
    // -PTAPPYAI_RELEASE_KEY_ALIAS=... -PTAPPYAI_RELEASE_KEY_PASSWORD=...` (or gradle.properties),
    // the same override convention already used for TAPPYAI_SUPABASE_URL etc. above. The real
    // keystore file itself is never committed — same `.jks`/`.keystore` .gitignore rule as always.
    val releaseKeystorePath = project.findProperty("TAPPYAI_RELEASE_KEYSTORE_PATH") as String?
    val releaseKeystorePassword = project.findProperty("TAPPYAI_RELEASE_KEYSTORE_PASSWORD") as String?
    val releaseKeyAlias = project.findProperty("TAPPYAI_RELEASE_KEY_ALIAS") as String?
    val releaseKeyPassword = project.findProperty("TAPPYAI_RELEASE_KEY_PASSWORD") as String?
    val hasReleaseSigningConfig = listOf(
        releaseKeystorePath, releaseKeystorePassword, releaseKeyAlias, releaseKeyPassword,
    ).all { !it.isNullOrBlank() }

    signingConfigs {
        if (hasReleaseSigningConfig) {
            create("release") {
                storeFile = file(releaseKeystorePath!!)
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            isMinifyEnabled = false
            isDebuggable = true
            // Defaults to the emulator's host-loopback dev server. Override with
            // -PTAPPYAI_API_BASE_URL_DEBUG=https://host/ to point a debug build at a real HTTPS
            // backend (e.g. Owner UAT on a physical phone, where 10.0.2.2 is unreachable). Must end
            // in "/" and use the final (non-redirecting) host so the JWT isn't dropped on a redirect.
            // Build config only — no business-logic change.
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
            if (hasReleaseSigningConfig) {
                signingConfig = signingConfigs.getByName("release")
            }
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

// Round-3 audit fix: with none of these -PTAPPYAI_* properties supplied, `release`'s
// buildConfigFields (above) silently fall back to non-resolving placeholder values and
// assembleRelease/bundleRelease still succeed — shipping an APK/AAB with no working login, no
// API calls, and a broken WebView origin check. The signing props are gated for the same reason:
// without them `hasReleaseSigningConfig` is false and the release variant produces an UNSIGNED
// artifact instead of failing. Only release-variant build/bundle tasks are gated; debug/staging
// (which have their own real, non-placeholder defaults and debug signing) are unaffected.
tasks.matching { it.name in setOf("assembleRelease", "bundleRelease") }.configureEach {
    doFirst {
        val required = listOf(
            "TAPPYAI_SUPABASE_URL",
            "TAPPYAI_SUPABASE_ANON_KEY",
            "TAPPYAI_GOOGLE_WEB_CLIENT_ID",
            "TAPPYAI_WEB_APP_URL",
            "TAPPYAI_API_BASE_URL_RELEASE",
            "TAPPYAI_RELEASE_KEYSTORE_PATH",
            "TAPPYAI_RELEASE_KEYSTORE_PASSWORD",
            "TAPPYAI_RELEASE_KEY_ALIAS",
            "TAPPYAI_RELEASE_KEY_PASSWORD",
        )
        val missing = required.filter { (project.findProperty(it) as String?).isNullOrBlank() }
        if (missing.isNotEmpty()) {
            throw GradleException(
                "Refusing to build a release APK/AAB with placeholder or unsigned configuration. " +
                    "Missing gradle properties: ${missing.joinToString(", ")}. " +
                    "Supply them via -P<name>=... or gradle.properties before running " +
                    "assembleRelease/bundleRelease."
            )
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
    implementation(libs.media3.ui)
    // Device location (FusedLocationProvider) for chat location bias / Nearby / For-You city boost.
    implementation(libs.play.services.location)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.splashscreen)
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
