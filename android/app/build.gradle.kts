import java.io.ByteArrayOutputStream
import java.util.Base64

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

/**
 * The short commit this build came from, or "unknown" when git is unavailable (C01).
 *
 * Never fails the build: identification is a convenience for whoever holds the artifact later, and
 * a contributor without git on PATH must still be able to compile.
 */
fun gitSha(): String = try {
    val out = ByteArrayOutputStream()
    project.exec {
        commandLine("git", "rev-parse", "--short=12", "HEAD")
        standardOutput = out
        errorOutput = ByteArrayOutputStream()
        isIgnoreExitValue = true
    }
    out.toString().trim().ifEmpty { "unknown" }
} catch (_: Exception) {
    "unknown"
}

/** Reads a Gradle property, treating blank as absent so `-PFoo=` cannot slip an empty value through. */
fun releaseProp(name: String, default: String): String =
    (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: default

val supabaseUrl = releaseProp("TAPPYAI_SUPABASE_URL", "https://your-project.supabase.co")
val supabaseAnonKey = releaseProp("TAPPYAI_SUPABASE_ANON_KEY", "REPLACE_WITH_SUPABASE_ANON_KEY")
val googleWebClientId =
    releaseProp("TAPPYAI_GOOGLE_WEB_CLIENT_ID", "REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com")
val webAppUrl = releaseProp("TAPPYAI_WEB_APP_URL", prodWebAppUrl)
val releaseApiBaseUrl = releaseProp("TAPPYAI_API_BASE_URL_RELEASE", prodApiBaseUrl)

// ============================================================================
// RELEASE CONFIGURATION VALIDATION — C19
// ============================================================================
//
// 🚨 WHAT WENT WRONG, AND WHY THE OLD GUARD COULD NOT HAVE CAUGHT IT
//
// This used to be a DENYLIST of placeholder spellings:
//
//     listOf("tappyai.example.com", "your-project.supabase.co", "REPLACE_WITH")
//
// The template this repo ships (`gradle.properties.template`) writes
// `https://<your-project>.supabase.co`. `"https://<your-project>.supabase.co".contains(
// "your-project.supabase.co")` is FALSE — the `>` sits between the two halves. So the guard
// missed all three of its own template's placeholders, `./gradlew :app:assembleRelease` printed
// BUILD SUCCESSFUL, and the signed 5.87 MB APK that came out could never authenticate: installed
// on a real device it sat on the login screen forever, because its Supabase client pointed at a
// project that does not exist.
//
// A denylist of prose can never be complete — the next placeholder convention is always the one
// nobody listed. So this is now a POSITIVE validator: every value must LOOK LIKE the real thing,
// and anything else fails, whatever spelling it used.
//
// 🚨 Values are never echoed in full. A wrong-but-real key would otherwise be printed into CI
// logs by the very check meant to protect it.

/** Any punctuation or wording a human uses to say "fill this in". Deliberately broad. */
val placeholderShapes = listOf(
    Regex("[<>{}\\[\\]]"),                         // <your-project>, {{KEY}}, [PASTE HERE]
    Regex("(?i)\\b(replace|your|placeholder|todo|changeme|xxx+|fixme)\\b"),
    Regex("(?i)example\\.(com|org|net)"),
    Regex("(?i)\\b(localhost|127\\.0\\.0\\.1|staging)\\b"),
)

/** Redacts a value so a failure message can name the problem without publishing the secret. */
fun redact(value: String): String =
    if (value.length <= 12) "\"$value\"" else "\"${value.take(6)}…${value.takeLast(4)}\" (${value.length} chars)"

/**
 * Validates one release property. Returns null when it is good, or the reason it is not.
 *
 * `shape` is what a REAL value looks like. Being explicit about that is the whole point: an
 * unrecognised value is rejected rather than assumed fine.
 */
fun validateReleaseValue(name: String, value: String, shape: Regex, shapeDescription: String): String? {
    if (value.isBlank()) return "$name is empty"
    placeholderShapes.firstOrNull { it.containsMatchIn(value) }?.let {
        return "$name looks like a placeholder: ${redact(value)}"
    }
    if (!shape.matches(value)) return "$name is not $shapeDescription: ${redact(value)}"
    return null
}

/** The Supabase project ref, as it appears in the URL — used to cross-check the anon key. */
fun supabaseProjectRef(url: String): String? =
    Regex("^https://([a-z0-9]{16,})\\.supabase\\.co/?$").find(url.trim())?.groupValues?.get(1)

/**
 * Decodes a JWT payload without verifying the signature — enough to read `role` and `ref`.
 * Signature verification is not the job here; catching "the anon key of a DIFFERENT project" is.
 */
fun jwtPayload(token: String): String? {
    val parts = token.split(".")
    if (parts.size != 3) return null
    return try {
        val body = parts[1].replace('-', '+').replace('_', '/').padEnd((parts[1].length + 3) / 4 * 4, '=')
        String(Base64.getDecoder().decode(body))
    } catch (_: Exception) {
        null
    }
}

// Only guard the tasks that actually produce or install a release artifact.
// Checking every task would break `assembleDebug` and IDE syncs on a machine
// that has no production credentials, which is a normal state for a contributor.
val releaseArtifactRequested = gradle.startParameter.taskNames.any {
    Regex("(bundle|assemble|install|publish).*Release", RegexOption.IGNORE_CASE).containsMatchIn(it)
}


if (releaseArtifactRequested) {
    val httpsUrl = Regex("^https://[a-z0-9.-]+\\.[a-z]{2,}/?$")
    val problems = buildList {
        validateReleaseValue("TAPPYAI_API_BASE_URL_RELEASE", releaseApiBaseUrl,
            httpsUrl, "an https URL (every API request the app makes)")?.let { add(it) }
        validateReleaseValue("TAPPYAI_WEB_APP_URL", webAppUrl,
            httpsUrl, "an https URL (shareable Group Dining links and QR profile URLs)")?.let { add(it) }
        validateReleaseValue("TAPPYAI_SUPABASE_URL", supabaseUrl,
            Regex("^https://[a-z0-9]{16,}\\.supabase\\.co/?$"),
            "a Supabase project URL (authentication and all database access)")?.let { add(it) }
        validateReleaseValue("TAPPYAI_SUPABASE_ANON_KEY", supabaseAnonKey,
            Regex("^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$"),
            "a JWT (authentication and all database access)")?.let { add(it) }
        validateReleaseValue("TAPPYAI_GOOGLE_WEB_CLIENT_ID", googleWebClientId,
            Regex("^[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com$"),
            "a Google OAuth web client id (Sign in with Google)")?.let { add(it) }

        // 🚨 "Wrong Supabase project" — a real URL and a real key that belong to DIFFERENT projects
        // is the failure a shape check alone cannot see, and it produces the same dead app.
        val ref = supabaseProjectRef(supabaseUrl)
        val payload = jwtPayload(supabaseAnonKey)
        if (ref != null && payload != null) {
            if (!payload.contains("\"role\":\"anon\"")) {
                add("TAPPYAI_SUPABASE_ANON_KEY is not an anon key — its role claim is not \"anon\"")
            }
            if (!payload.contains("\"ref\":\"$ref\"")) {
                add("TAPPYAI_SUPABASE_ANON_KEY belongs to a different project than TAPPYAI_SUPABASE_URL (expected ref \"$ref\")")
            }
        }
    }
    if (problems.isNotEmpty()) {
        throw GradleException(
            buildString {
                appendLine("Refusing to build a release artifact with invalid configuration.")
                appendLine()
                problems.forEach { appendLine("  • $it") }
                appendLine()
                appendLine("Such a build succeeds and packages cleanly, then fails at runtime on a real device:")
                appendLine("the app installs, opens, and can never sign in.")
                appendLine()
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
        // 🚨 8, not 7 — C01.
        //
        // vc7 is SPENT in the same practical sense vc6 was. A vc7 artifact was built, signed and
        // installed on a real device; this tree then changed materially (B07–B17, then the fix
        // round for the release-readiness UAT). Two different APKs both calling themselves
        // `versionCode=7 versionName=0.1.2` were compared during that UAT: `aapt2 dump strings`
        // found Scam Shield in one and not the other. Nothing on a device, in a bug report or in
        // Play could have told them apart, and Play rejects a reused versionCode outright.
        // 9, not 8 — vc8 (0.1.3) is SPENT: its AAB was produced as the V2 release candidate and
        // handed to the owner for Play upload. This build carries the gallery-scan decode fix
        // (decodeSampledBitmap bailed on every gallery image because the null-guard sat on the
        // bounds-only decode, which returns null by design). A shipped versionCode is never reused
        // even if the prior one was never actually uploaded — Play rejects a reused code outright.
        versionCode = 9
        versionName = "0.1.4"

        vectorDrawables {
            useSupportLibrary = true
        }

        // Phase 1B: one Supabase project shared across variants (matching the web app's own
        // single-project setup — no evidence of separate staging/prod Supabase projects).
        // Placeholders below are NOT real values — supply real ones via
        // `-PTAPPYAI_SUPABASE_URL=... -PTAPPYAI_SUPABASE_ANON_KEY=... -PTAPPYAI_GOOGLE_WEB_CLIENT_ID=...`
        // (gradle.properties or CLI), same override pattern as `API_BASE_URL` below. No login
        // will complete without these — see the plan's M9 verification note.
        /**
         * The exact source this artifact was built from — C01.
         *
         * A versionCode says which RELEASE an APK claims to be; it cannot say which BUILD it is.
         * During the release-readiness UAT two materially different APKs both reported
         * `versionCode=7 versionName=0.1.2`, and the only way to tell them apart was to unzip
         * both and diff their string tables. Bumping the version fixes today's collision; this
         * makes the question answerable for every future artifact, including two builds of the
         * same version code from different commits.
         *
         * Mirrors what the web already does with BUILD_ID. Falls back to "unknown" rather than
         * failing the build — a developer without git on PATH should still be able to compile.
         */
        buildConfigField("String", "GIT_SHA", "\"${gitSha()}\"")
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

    testOptions {
        unitTests {
            // Robolectric needs the merged Android resources/assets/manifest on the unit-test
            // classpath to bring up a real Application + BitmapFactory sandbox.
            isIncludeAndroidResources = true
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
    // Needed to drive a ViewModel under test: viewModelScope runs on Dispatchers.Main, which
    // has no Android looper in a unit test until setMain() replaces it.
    testImplementation(libs.kotlinx.coroutines.test)
    // Robolectric runs the real android.graphics.BitmapFactory + ContentResolver on the JVM, so
    // ScanViewModel's two-pass gallery decode can be exercised as a plain unit test (no device).
    testImplementation(libs.robolectric)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
