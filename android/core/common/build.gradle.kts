// Pure Kotlin/JVM, not an Android library — UiState.kt has zero Android framework
// dependency, so it doesn't need AGP's AAR packaging/manifest/R-class machinery. Feature
// modules and other core modules depend on this as a plain Kotlin dependency.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

// Real build error found during Phase 1B.1 first local build: the `java {}` block alone only
// sets compileJava's target (17), leaving compileKotlin defaulting to the JDK running Gradle
// (21, JBR) — "Inconsistent JVM-target compatibility detected". `jvmToolchain(17)` would fix
// this too, but requires Gradle to locate/auto-download a real JDK 17 toolchain, which failed
// on this machine (only JBR 21 installed, no toolchain resolver configured) — so instead this
// pins the Kotlin compile task's bytecode target directly, matching `java {}` below without
// needing a separate JDK.
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
