package com.tappyai.app.language

import androidx.appcompat.app.AppCompatDelegate
import java.util.Locale

/**
 * The single authority for "what language is the UI actually rendering in".
 *
 * ============================================================================
 * WHY THIS IS A STATELESS OBJECT AND NOT A METHOD ON LanguageManager
 * ============================================================================
 * It was one, briefly, and it produced a Dagger dependency cycle:
 *
 *   OkHttpClient → AppLanguageInterceptor → AppLanguageProvider → LanguageManager
 *               → AccountRepository → AccountApi → Retrofit → OkHttpClient
 *
 * `LanguageManager` needs `AccountRepository` only to sync the choice to the backend, which has
 * nothing to do with reading the current value — the read touches `AppCompatDelegate` and
 * `Locale` and nothing else. Splitting the read out removes the cycle at its cause rather than
 * papering over it with a lazy `Provider`, and it is the honest shape: this answer has no
 * dependencies, so it should not be reached through an object that does.
 *
 * ============================================================================
 * THE NULL CASE IS NOT A DEFAULT
 * ============================================================================
 * `AppCompatDelegate.getApplicationLocales()` is empty until the user chooses explicitly, and
 * AppCompat then renders in the system locale — so the system locale genuinely IS the rendered
 * language in that state, and resolving to it is correct rather than a fallback. Resolving to
 * `vi` unconditionally would ask the server for Vietnamese while the screen showed English, which
 * is V2-UAT-005 in a different disguise.
 *
 * Vietnamese is the last resort, for a system locale that is neither of the two we support.
 */
object AppLanguageResolver {

    /** The active [AppLanguage], or null when the user has never chosen one. */
    fun current(): AppLanguage? =
        AppCompatDelegate.getApplicationLocales().takeIf { !it.isEmpty }
            ?.get(0)?.language?.let { AppLanguage.fromTag(it) }

    /** A BCP-47 primary tag — `vi` or `en`. Never null; read at call time, never cached. */
    fun currentTag(): String =
        (current() ?: AppLanguage.fromTag(Locale.getDefault().language) ?: AppLanguage.Vietnamese).tag
}
