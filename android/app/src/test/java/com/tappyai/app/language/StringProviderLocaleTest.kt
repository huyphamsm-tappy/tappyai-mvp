package com.tappyai.app.language

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * B13 — a string resolved for the user must be in the APP's language, not the phone's.
 *
 * ============================================================================
 * WHY THIS IS A SOURCE CONTRACT AND NOT A BEHAVIOURAL TEST
 * ============================================================================
 * The behaviour needs a real `Context`, `AppCompatDelegate` and the resource system. This module
 * has plain JUnit and no Robolectric, so a behavioural assertion here would need either a new test
 * dependency or an instrumented test, and instrumented tests do not run in CI at all (CI runs no
 * Gradle — see the native gate note in `project_native_composer_link_provider_parity`). A source
 * contract that actually runs is worth more than a behavioural test that never does.
 *
 * What it pins is the specific mistake that caused B13: resolving user-facing strings straight off
 * the injected `@ApplicationContext`, whose configuration AppCompat does NOT patch below API 33.
 * The device evidence is recorded in `StringProviderImpl`'s KDoc.
 */
class StringProviderLocaleTest {

    private val impl = File("src/main/java/com/tappyai/app/di/StringProviderImpl.kt")

    private fun source(): String {
        assertTrue(
            "StringProviderImpl.kt not found at ${impl.absolutePath} — this guard would pass vacuously",
            impl.exists(),
        )
        return impl.readText()
    }

    @Test
    fun `strings are resolved through a locale-configured context, not the raw application context`() {
        val src = source()

        // The application context is still INJECTED — it is the base a configured context is
        // derived from, and it must stay a @Singleton-safe reference. What must not happen is
        // calling getString on it directly.
        assertTrue(
            "StringProviderImpl must derive a locale-correct Context via createConfigurationContext",
            src.contains("createConfigurationContext"),
        )
        assertTrue(
            "the app locale must come from AppCompatDelegate.getApplicationLocales() — the same " +
                "authority AppLanguageResolver reads, so there is no second source of truth",
            src.contains("AppCompatDelegate.getApplicationLocales()"),
        )

        // 🚨 The regression itself: `context.getString(...)` on the injected application context.
        // The fixed code calls `localized().getString(...)`.
        assertFalse(
            "StringProviderImpl must not call getString on the injected application context — " +
                "below API 33 that context keeps the SYSTEM locale, which is B13",
            Regex("""\bcontext\.getString\(""").containsMatchIn(src),
        )
    }

    @Test
    fun `an unset app language still resolves through the system locale`() {
        // Not a fallback — when the user has never chosen, AppCompat genuinely renders in the
        // system locale, so returning the plain application context is the CORRECT answer. A fix
        // that forced a language here would have re-broken first-run in the other direction.
        val src = source()
        assertTrue(
            "the empty-locale case must short-circuit to the unmodified application context",
            src.contains("if (locales.isEmpty) return context"),
        )
    }

    @Test
    fun `the resolved context is cached per language tag so it self-invalidates on switch`() {
        val src = source()
        assertTrue("cache must be keyed on the language tags", src.contains("cachedTags"))
        assertTrue(
            "a @Singleton is reachable from any thread, so the cache fields must be @Volatile",
            Regex("""@Volatile\s+private var cached""").containsMatchIn(src),
        )
    }

    @Test
    fun `every user-facing string still goes through StringProvider`() {
        // Guards the guard from the other side: if callers stopped using StringProvider and went
        // back to their own contexts, fixing this class would fix nothing. 27 files / ~150 sites
        // were measured during UAT; assert the shape is still centralised.
        val callers = File("src/main/java/com/tappyai/app")
            .walkTopDown()
            .filter { it.extension == "kt" }
            .count { it.readText().contains("stringProvider") }
        assertTrue(
            "expected StringProvider to remain the shared way features resolve strings, found $callers files",
            callers >= 20,
        )
    }
}
