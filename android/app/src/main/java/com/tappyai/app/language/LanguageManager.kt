package com.tappyai.app.language

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.tappyai.app.account.data.AccountRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The Android equivalent of the web's `useTranslation`/`setLocale` module store
 * (`src/lib/i18n/useTranslation.ts`) — a device-locale-independent, app-scoped language choice.
 *
 * [androidx.appcompat.app.AppCompatDelegate.setApplicationLocales] is the platform-native
 * mechanism this maps onto: it overrides only this app's resource locale (not the system's), and
 * — critically — Android's own resource system then picks `values-vi/`/`values`(default) string
 * sets automatically, so there is no need for a hand-rolled dictionary/key-lookup layer the way
 * the web needed one (the web has no OS-level resource-qualifier system to lean on). AppCompat
 * persists the choice itself (an internal SharedPreferences-backed store), which is why there is
 * no separate DataStore write here — [current] simply reads AppCompat's own state back.
 *
 * Backend sync (`PATCH /api/profile {language}`) is best-effort, matching the web's own
 * `LanguagePicker.tsx` behavior (fire-and-forget, ignored if it fails) — the in-app switch must
 * never block or fail on network trouble.
 */
@Singleton
class LanguageManager @Inject constructor(
    private val accountRepository: AccountRepository,
    private val logger: LoggerProvider,
) {

    /** The active language, or null if the user hasn't explicitly chosen one yet (AppCompat then
     *  falls back to the system locale, same "not yet set" state the web's `getStoredLocale()
     *  === null` first-visit case models). */
    val current: AppLanguage?
        get() = AppCompatDelegate.getApplicationLocales().takeIf { !it.isEmpty }
            ?.get(0)?.language?.let { AppLanguage.fromTag(it) }

    suspend fun setLanguage(language: AppLanguage) {
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language.tag))
        val result = accountRepository.updateLanguage(language.tag)
        if (result is NetworkResult.Error) {
            logger.w(TAG, "Best-effort language sync to backend failed: ${result.error}")
        }
    }

    private companion object {
        const val TAG = "LanguageManager"
    }
}
