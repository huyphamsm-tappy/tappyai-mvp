plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.tappyai.core.designsystem"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
    }

    buildFeatures {
        compose = true
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
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    // androidx-ui-text-google-fonts, material3-adaptive(-layout/-navigation) and
    // material3-window-size-class are pinned in the version catalog but intentionally not
    // depended on here yet: Phase 0's window-size token (WindowSize.kt) uses the lighter
    // LocalConfiguration-based approach (no Activity coupling needed inside a pure UI
    // module); real ListDetailPaneScaffold usage lands with the Phase 2 multi-pane screens
    // per the roadmap. See the note in theme/Type.kt for why Inter isn't wired up either.
    implementation(libs.coil.compose)

    debugImplementation(libs.androidx.compose.ui.tooling)
}
