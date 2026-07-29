package com.tappyai.app.theme

/**
 * [com.tappyai.core.datastore.PreferencesDataSource] key for the persisted dark/light choice —
 * the native analog of the web's `localStorage['theme']` (`src/components/Header.tsx`). Stored as
 * the literal `"dark"`/`"light"` string the web itself uses, not a boolean, so the two platforms'
 * on-disk representations read the same way. Absent (null) means "no explicit choice yet" and
 * both platforms then fall back to the system/OS dark-mode preference.
 *
 * Shared between [com.tappyai.app.MainActivity] (reads it to pick [TappyAITheme]'s `darkTheme`,
 * writes it on toggle) and [com.tappyai.app.profile.SettingsViewModel] (the Settings-screen toggle
 * — the only reachable user-facing entry point, since [com.tappyai.app.showcase.DesignSystemShowcaseScreen]'s
 * own toggle is dev-only and unreachable from real navigation). Both read/write the same
 * [com.tappyai.core.datastore.PreferencesDataSource]-backed DataStore singleton, so a change from
 * either place is immediately visible to the other — no extra plumbing needed.
 */
const val APP_THEME_KEY = "app_theme"
const val APP_THEME_DARK_VALUE = "dark"
const val APP_THEME_LIGHT_VALUE = "light"
