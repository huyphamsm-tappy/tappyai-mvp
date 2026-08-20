package com.tappyai.core.network

/**
 * The seam through which the network layer learns what language the UI is actually rendering in.
 *
 * It exists for the same reason [com.tappyai.core.security.TokenProvider] does: `core:network`
 * must not depend on `:app`, and the answer lives in `:app` (LanguageManager, on top of
 * AppCompatDelegate). `:app` binds the implementation in its own Hilt module, exactly as it binds
 * the base URL.
 *
 * 🚨 THE APP LANGUAGE, NOT THE DEVICE LOCALE. Those differ precisely when it matters most — a
 * user who set the app to English on a Vietnamese phone. Returning `Locale.getDefault()` here
 * would reinstate V2-UAT-005 one layer lower down and make it invisible, because every request
 * would then carry a plausible-looking language that simply was not the one on screen.
 *
 * Returns null when the user has never chosen: AppCompat then follows the system locale, and so
 * does the UI, so the system locale IS the rendered language in that state and the implementation
 * resolves to it.
 */
fun interface AppLanguageProvider {
    /** A BCP-47 primary tag — `vi`, `en`. Never null: the implementation resolves the fallbacks. */
    fun languageTag(): String
}
