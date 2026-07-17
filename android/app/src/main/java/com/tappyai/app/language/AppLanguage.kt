package com.tappyai.app.language

/**
 * The two UI languages the web supports (`src/lib/i18n/dictionaries.ts`'s `Locale` type) — `tag`
 * is the BCP-47 language tag passed to [androidx.appcompat.app.AppCompatDelegate.setApplicationLocales]
 * and the value persisted to the backend's `profiles.language` column (`vi`/`en`, enforced
 * server-side in `PATCH /api/profile`).
 */
enum class AppLanguage(val tag: String, val flag: String, val displayName: String) {
    Vietnamese(tag = "vi", flag = "🇻🇳", displayName = "Tiếng Việt"),
    English(tag = "en", flag = "🇬🇧", displayName = "English"),
    ;

    companion object {
        fun fromTag(tag: String?): AppLanguage? = entries.firstOrNull { it.tag == tag }
    }
}
