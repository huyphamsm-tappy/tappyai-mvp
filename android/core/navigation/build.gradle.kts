// Pure Kotlin/JVM — TappyRoute/TappyNavigator are plain contracts (no NavHost, no
// androidx.navigation dependency yet; that arrives with Phase 1's first real nav graph).
plugins {
    alias(libs.plugins.kotlin.jvm)
}

// Same fix as core:common's build.gradle.kts — see its comment for why this uses an explicit
// Kotlin jvmTarget instead of jvmToolchain (no standalone JDK 17 available on this machine).
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.kotlinx.coroutines.core)
}
