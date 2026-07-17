package com.tappyai.core.common

/**
 * Resolves a string resource for non-`@Composable` callers (ViewModels, Repositories) that need
 * localized text but can't call `stringResource()` — e.g. error-message mappers. Composables
 * should keep using `stringResource()` directly; this exists only for the call sites that can't.
 *
 * Backed by an Android `Context` (implementation lives in `:app`, since `core:common` is a plain
 * Kotlin/JVM module with no Android framework dependency — see this module's build.gradle.kts).
 * A resource ID is just an `Int`; any module's generated `R.string.*` constant works here
 * regardless of which module's `res/` actually declares it, since AGP merges all resources into
 * one namespace at build time.
 */
interface StringProvider {
    fun get(resId: Int): String
    fun get(resId: Int, vararg args: Any): String
}
