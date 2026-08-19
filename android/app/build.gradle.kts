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
    // V2-03: reads app/google-services.json. That one file declares com.tappyai.app,
    // com.tappyai.app.debug and com.tappyai.app.staging, so every variant resolves from it and
    // no per-variant copy exists to drift.
    alias(libs.plugins.google.services)
}

// ---------------------------------------------------------------------------
// Release configuration
//
// These are the *production* endpoints, not placeholders. They used to default
// to `tappyai.example.com`, which meant a release built without the matching -P
// override compiled and packaged perfectly while pointing every request at a
// domain that does not exist — a broken AAB that looks fine until it is
// installed. Public endpoints are not secrets, so the safe default is the real
// value; only credentials are left to be supplied per-machine.
//
// See docs/release/ANDROID_RELEASE_CONFIGURATION.md for the full property
// contract (what each one does, where to store it, what breaks without it).
// ---------------------------------------------------------------------------
val prodApiBaseUrl = "https://www.tappyai.com/"  // Retrofit baseUrl — trailing slash required
val prodWebAppUrl = "https://www.tappyai.com"    // link building — no trailing slash

/** Reads a Gradle property, treating blank as absent so `-PFoo=` cannot slip an empty value through. */
fun releaseProp(name: String, default: String): String =
    (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: default

val supabaseUrl = releaseProp("TAPPYAI_SUPABASE_URL", "https://your-project.supabase.co")
val supabaseAnonKey = releaseProp("TAPPYAI_SUPABASE_ANON_KEY", "REPLACE_WITH_SUPABASE_ANON_KEY")
val googleWebClientId =
    releaseProp("TAPPYAI_GOOGLE_WEB_CLIENT_ID", "REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com")
val webAppUrl = releaseProp("TAPPYAI_WEB_APP_URL", prodWebAppUrl)
val releaseApiBaseUrl = releaseProp("TAPPYAI_API_BASE_URL_RELEASE", prodApiBaseUrl)

// Substrings that must never appear in a shipped release artifact. Kept as
// markers rather than exact matches so a *variant* of a placeholder (a stray
// staging host, a half-edited REPLACE_WITH_) is caught too.
val placeholderMarkers = listOf("tappyai.example.com", "your-project.supabase.co", "REPLACE_WITH")

// Only guard the tasks that actually produce or install a release artifact.
// Checking every task would break `assembleDebug` and IDE syncs on a machine
// that has no production credentials, which is a normal state for a contributor.
val releaseArtifactRequested = gradle.startParameter.taskNames.any {
    Regex("(bundle|assemble|install|publish).*Release", RegexOption.IGNORE_CASE).containsMatchIn(it)
}

if (releaseArtifactRequested) {
    val problems = buildList {
        listOf(
            Triple("TAPPYAI_API_BASE_URL_RELEASE", releaseApiBaseUrl, "every API request the app makes"),
            Triple("TAPPYAI_WEB_APP_URL", webAppUrl, "shareable Group Dining links and QR profile URLs"),
            Triple("TAPPYAI_SUPABASE_URL", supabaseUrl, "authentication and all database access"),
            Triple("TAPPYAI_SUPABASE_ANON_KEY", supabaseAnonKey, "authentication and all database access"),
            Triple("TAPPYAI_GOOGLE_WEB_CLIENT_ID", googleWebClientId, "Sign in with Google"),
        ).forEach { (name, value, breaks) ->
            placeholderMarkers.firstOrNull { value.contains(it) }?.let { marker ->
                add("  • $name resolves to \"$value\"\n      contains placeholder \"$marker\" — would break $breaks")
            }
        }
    }
    if (problems.isNotEmpty()) {
        throw GradleException(
            buildString {
                appendLine("Refusing to build a release artifact with placeholder configuration.")
                appendLine()
                problems.forEach { appendLine(it) }
                appendLine()
                appendLine("Such a build succeeds and packages cleanly, then fails at runtime on a real device.")
                appendLine("Supply the real values via ~/.gradle/gradle.properties or -P flags:")
                appendLine("  ./gradlew :app:bundleRelease -PTAPPYAI_SUPABASE_ANON_KEY=... ")
                appendLine()
                append("See docs/release/ANDROID_RELEASE_CONFIGURATION.md")
            }
        )
    }
}

android {
    namespace = "com.tappyai.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tappyai.app"
        minSdk = 26
        // Google Play target API level policy: from 2026-08-31 every new app and app update must
        // target API 36 (Android 16). Raised from 35 for that reason alone — compileSdk was
        // already 36 (androidx.browser 1.9.0 forced it during Phase 1B.1), so this is a policy
        // change, not a toolchain one: no AGP/Gradle/Kotlin/dependency move came with it.
        targetSdk = 36
        // 7, not 6. Play requires a strictly increasing versionCode, and 6 is SPENT: the vc6
        // artifact was uploaded, reviewed and released to the closed "Alpha" track on 2026-08-16
        // (Play Console: "Đã phát hành ... 16 thg 8 9:04"). Re-uploading 6 is rejected outright.
        //
        // Note the released vc6 targets API 35 — it was built before the targetSdk bump, from a
        // tree that also predates the Deals crash fix. This build is the first artifact carrying
        // both, so it cannot reuse that version code even though the branch was authored against
        // it. versionName goes to 0.1.2 because 0.1.1 was also used (vc5).
        versionCode = 7
        versionName = "0.1.2"

        vectorDrawables {
            useSupportLibrary = true
        }

        // Phase 1B: one Supabase project shared across variants (matching the web app's own
        // single-project setup — no evidence of separate staging/prod Supabase projects).
        // Placeholders below are NOT real values — supply real ones via
        // `-PTAPPYAI_SUPABASE_URL=... -PTAPPYAI_SUPABASE_ANON_KEY=... -PTAPPYAI_GOOGLE_WEB_CLIENT_ID=...`
        // (gradle.properties or CLI), same override pattern as `API_BASE_URL` below. No login
        // will complete without these — see the plan's M9 verification note.
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"$supabaseAnonKey\"")
        // Google Cloud OAuth 2.0 "Web application"-type client ID (not the Android-type one) —
        // Credential Manager's native Google Sign-In requires this specific type as the
        // `serverClientId`, and it must match whatever client ID Supabase's Google provider is
        // configured with server-side.
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
        // Public web origin used to build shareable Group Dining links (`<origin>/group/{id}`) and
        // QR profile URLs — the same value as the web app's NEXT_PUBLIC_APP_URL. Distinct from
        // API_BASE_URL (which is the emulator loopback in debug and not a shareable public URL).
        // Defaults to production; override with `-PTAPPYAI_WEB_APP_URL=https://...` (no trailing
        // slash). Applies to all variants.
        buildConfigField("String", "WEB_APP_URL", "\"$webAppUrl\"")
    }

    // Release signing (Production Readiness Sprint) — no signingConfigs block existed at all
    // before this, which is a hard Play Store submission blocker (an unsigned release build
    // can't be uploaded). Safe when absent: with none of the four properties supplied,
    // signingConfigs stays empty and `release` builds exactly as it did before (unsigned,
    // installable only after a separate signing step). The real keystore file itself is never
    // committed — same `.jks`/`.keystore` .gitignore rule as always.
    val releaseKeystorePath = project.findProperty("TAPPYAI_RELEASE_KEYSTORE_PATH") as String?
    val releaseKeystorePassword = project.findProperty("TAPPYAI_RELEASE_KEYSTORE_PASSWORD") as String?
    val releaseKeyAlias = project.findProperty("TAPPYAI_RELEASE_KEY_ALIAS") as String?
    val releaseKeyPassword = project.findProperty("TAPPYAI_RELEASE_KEY_PASSWORD") as String?
    val hasReleaseSigningConfig = listOf(
        releaseKeystorePath, releaseKeystorePassword, releaseKeyAlias, releaseKeyPassword,
    ).all { !it.isNullOrBlank() }

    // Warn rather than fail: a contributor without the keystore must still be able to run
    // release-variant tasks (lint, unit tests, `generateReleaseBuildConfig`) on a clean checkout.
    // Play rejects an unsigned upload outright, so this cannot ship silently the way a placeholder
    // URL could — but an unsigned artifact is easy to mistake for a finished one, hence the notice.
    if (releaseArtifactRequested && !hasReleaseSigningConfig) {
        logger.warn(
            "\n⚠  Release signing is NOT configured — this artifact will be UNSIGNED and Play will reject it." +
                "\n   Supply TAPPYAI_RELEASE_KEYSTORE_PATH, _KEYSTORE_PASSWORD, _KEY_ALIAS, _KEY_PASSWORD." +
                "\n   See docs/release/ANDROID_RELEASE_CONFIGURATION.md\n"
        )
    }

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
            if (hasReleaseSigningConfig) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")
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
    // Firebase Cloud Messaging — transport only. The BOM decides the messaging version; nothing
    // else from Firebase is pulled in (no Analytics, no Crashlytics).
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging.ktx)
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
