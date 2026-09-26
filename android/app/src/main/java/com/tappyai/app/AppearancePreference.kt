package com.tappyai.app

import com.tappyai.core.datastore.PreferencesDataSource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The app's ONE appearance rule — the Android twin of the web's `lib/theme/useThemeMode.ts`, with
 * the third state the product contract names explicitly (UAT 2026-09-17):
 *
 *   SYSTEM (default)  nothing chosen, or "Theo hệ thống" chosen — the OS decides, and keeps
 *                     deciding as the OS setting changes;
 *   LIGHT / DARK      an explicit choice, kept across restarts and across OS changes until the
 *                     person changes it again — from the Home top-bar toggle or from Settings.
 *
 * 🚨 WHY A THIRD STATE. Until now the store held only `dark_theme: Boolean?`: the Home toggle
 * wrote `true`/`false` and nothing could ever write "follow the system again", so one tap of the
 * moon pinned the app to a side forever and Settings had no "Giao diện" row although the Profile
 * hub promised one. [PREF_APPEARANCE_MODE] holds the three-way choice; the legacy boolean is still
 * READ (an installed user's earlier Light/Dark survives the upgrade) and is cleared on the first
 * write, so the two keys can never disagree.
 *
 * The resolved value is handed to `TappyAITheme` once, in `MainActivity`, and every screen below
 * reads the resolved `ColorScheme`. No screen asks the OS a second time and no screen pins a
 * palette of its own.
 */
enum class AppearanceMode(val wire: String) {
    System("system"),
    Light("light"),
    Dark("dark");

    companion object {
        fun fromWire(value: String?): AppearanceMode? = entries.firstOrNull { it.wire == value }
    }
}

/** The three-way choice. */
const val PREF_APPEARANCE_MODE = "appearance_mode"

/** The pre-2026-09-17 boolean override (`true` = dark). Read for migration, never written again. */
const val PREF_DARK_THEME = "dark_theme"

/** Pure: the stored three-way mode wins; else the legacy boolean; else System. */
fun appearanceModeFrom(stored: String?, legacyDark: Boolean?): AppearanceMode =
    AppearanceMode.fromWire(stored) ?: when (legacyDark) {
        true -> AppearanceMode.Dark
        false -> AppearanceMode.Light
        null -> AppearanceMode.System
    }

/** Pure: what the theme draws for a mode, given what the OS says right now. */
fun resolveDarkTheme(mode: AppearanceMode, systemDark: Boolean): Boolean = when (mode) {
    AppearanceMode.System -> systemDark
    AppearanceMode.Light -> false
    AppearanceMode.Dark -> true
}

/** Kept for the pre-mode call shape: `stored` is the legacy boolean or null. */
fun resolveDarkTheme(stored: Boolean?, systemDark: Boolean): Boolean =
    resolveDarkTheme(appearanceModeFrom(null, stored), systemDark)

/** The one reader/writer of the appearance choice, over the shared [PreferencesDataSource]. */
@Singleton
class AppearanceStore @Inject constructor(private val preferences: PreferencesDataSource) {

    /** The current mode, live; the legacy boolean is honoured until the first write clears it. */
    val mode: Flow<AppearanceMode> =
        combine(preferences.getString(PREF_APPEARANCE_MODE), preferences.getBoolean(PREF_DARK_THEME)) { stored, legacy ->
            appearanceModeFrom(stored, legacy)
        }.distinctUntilChanged()

    /**
     * Read once, synchronously, before the first frame — a few KB already on disk — so an explicit
     * choice is honoured from the first frame instead of flashing the system palette once. An
     * unreadable store degrades to System.
     */
    fun initialMode(): AppearanceMode = runCatching { runBlocking { mode.first() } }.getOrDefault(AppearanceMode.System)

    /** The person's choice, as-is. Clears the legacy key so it can never shadow this one. */
    suspend fun set(mode: AppearanceMode) {
        preferences.setString(PREF_APPEARANCE_MODE, mode.wire)
        preferences.remove(PREF_DARK_THEME)
    }
}
