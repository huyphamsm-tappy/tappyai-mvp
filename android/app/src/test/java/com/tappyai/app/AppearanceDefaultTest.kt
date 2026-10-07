package com.tappyai.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Appearance = System / Light / Dark (UAT 2026-09-17). Default SYSTEM: nothing stored → the OS
 * decides, live. An explicit Light/Dark wins over the OS and survives restarts; "Theo hệ thống"
 * hands control back to the OS. The rule is a pure function plus source pins: the resolution
 * happens once, in `MainActivity`; Settings exposes all three; no screen pins a palette or asks
 * the OS a second time.
 */
class AppearanceDefaultTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun raw(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
    private fun src(rel: String): String = raw(rel)
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    // ── The rule ──

    @Test
    fun `nothing stored is SYSTEM - the OS decides, both ways`() {
        assertEquals(AppearanceMode.System, appearanceModeFrom(stored = null, legacyDark = null))
        assertTrue(resolveDarkTheme(AppearanceMode.System, systemDark = true))
        assertFalse(resolveDarkTheme(AppearanceMode.System, systemDark = false))
    }

    @Test
    fun `an explicit Light or Dark wins over the OS - and keeps winning when the OS changes`() {
        assertTrue(resolveDarkTheme(AppearanceMode.Dark, systemDark = false))
        assertTrue(resolveDarkTheme(AppearanceMode.Dark, systemDark = true))
        assertFalse(resolveDarkTheme(AppearanceMode.Light, systemDark = true))
        assertFalse(resolveDarkTheme(AppearanceMode.Light, systemDark = false))
    }

    @Test
    fun `back to System follows the OS again`() {
        assertEquals(AppearanceMode.System, appearanceModeFrom(stored = "system", legacyDark = true))
        assertTrue(resolveDarkTheme(appearanceModeFrom("system", null), systemDark = true))
        assertFalse(resolveDarkTheme(appearanceModeFrom("system", null), systemDark = false))
    }

    @Test
    fun `the stored mode is the truth - the legacy boolean only fills in when no mode was ever written`() {
        assertEquals(AppearanceMode.Dark, appearanceModeFrom("dark", legacyDark = false))
        assertEquals(AppearanceMode.Light, appearanceModeFrom("light", legacyDark = true))
        assertEquals(AppearanceMode.Dark, appearanceModeFrom(null, legacyDark = true))
        assertEquals(AppearanceMode.Light, appearanceModeFrom(null, legacyDark = false))
        assertEquals("an unknown wire value is not a choice", AppearanceMode.System, appearanceModeFrom("sepia", null))
        assertEquals(listOf("system", "light", "dark"), AppearanceMode.entries.map { it.wire })
        // The pre-mode call shape still resolves the same way.
        assertTrue(resolveDarkTheme(stored = null, systemDark = true))
        assertTrue(resolveDarkTheme(stored = true, systemDark = false))
        assertFalse(resolveDarkTheme(stored = false, systemDark = true))
    }

    // ── Where the rule is applied ──

    @Test
    fun `MainActivity resolves the theme once from the mode and the system, from the first frame, and the Home toggle writes an explicit side`() {
        val m = src("app/src/main/java/com/tappyai/app/MainActivity.kt")
        assertTrue(m.contains("val isDark = resolveDarkTheme(mode = mode, systemDark = isSystemInDarkTheme())"))
        assertTrue("the first frame already knows the stored choice", m.contains("val initialMode = appearance.initialMode()") && m.contains("collectAsStateWithLifecycle(initialValue = initialMode)"))
        assertTrue("the resolved value is handed to the theme once", m.contains("TappyAITheme(darkTheme = isDark)"))
        assertTrue("the toggle picks the other side explicitly, never a hardcoded default", m.contains("appearance.set(if (isDark) AppearanceMode.Light else AppearanceMode.Dark)"))
        assertFalse("nothing writes the legacy boolean any more", m.contains("PREF_DARK_THEME"))
        assertFalse("nothing forces a night mode on the whole process", m.contains("setDefaultNightMode"))
        val store = src("app/src/main/java/com/tappyai/app/AppearancePreference.kt")
        assertTrue("an unreadable store degrades to System, never crashes", store.contains("runCatching { runBlocking { mode.first() } }.getOrDefault(AppearanceMode.System)"))
        assertTrue("a write clears the legacy key so the two can never disagree", store.contains("preferences.setString(PREF_APPEARANCE_MODE, mode.wire)") && store.contains("preferences.remove(PREF_DARK_THEME)"))
        assertEquals("appearance_mode", PREF_APPEARANCE_MODE)
        assertEquals("dark_theme", PREF_DARK_THEME)
    }

    @Test
    fun `Settings exposes all three choices - System, Light, Dark - and writes through the same store`() {
        val screen = src("app/src/main/java/com/tappyai/app/profile/SettingsScreen.kt")
        val vm = src("app/src/main/java/com/tappyai/app/profile/SettingsViewModel.kt")
        assertTrue(screen.contains("R.string.settings_appearance") && screen.contains("AppearanceMode.entries.forEach { option ->") && screen.contains("viewModel.selectAppearance(option)"))
        listOf("System" to "settings_appearance_system", "Light" to "settings_appearance_light", "Dark" to "settings_appearance_dark").forEach { (mode, res) ->
            assertTrue("$mode is labelled", screen.contains("AppearanceMode.$mode -> R.string.$res"))
        }
        assertTrue(vm.contains("val appearanceMode: StateFlow<AppearanceMode> = appearance.mode") && vm.contains("fun selectAppearance(mode: AppearanceMode)") && vm.contains("appearance.set(mode)"))
        val vi = raw("app/src/main/res/values-vi/strings_settings.xml")
        val en = raw("app/src/main/res/values/strings_settings.xml")
        listOf("settings_appearance", "settings_appearance_desc", "settings_appearance_system", "settings_appearance_light", "settings_appearance_dark").forEach {
            assertTrue("$it in vi and en", vi.contains("\"$it\"") && en.contains("\"$it\""))
        }
        assertTrue(vi.contains("<string name=\"settings_appearance_system\">Theo hệ thống</string>"))
    }

    @Test
    fun `no screen forces a theme - every real TappyAITheme call takes the resolved value, no screen asks the OS a second time, and the XML theme is DayNight`() {
        val kt = File(root(), "app/src/main").walkTopDown().filter { it.extension == "kt" }.toList() +
            File(root(), "core").walkTopDown().filter { it.extension == "kt" && it.path.replace('\\', '/').contains("/src/main/") }.toList()
        kt.forEach { f ->
            val s = f.readText().replace("\r\n", "\n")
                .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")
            // A `@Preview` may pin a palette; nothing that ships may.
            val shipping = s.replace(Regex("(?s)@Preview[\\s\\S]*?\\n}\\n"), "")
            assertFalse("${f.name} pins TappyAITheme to a palette", Regex("""TappyAITheme\(\s*darkTheme\s*=\s*(true|false)""").containsMatchIn(shipping))
            assertFalse("${f.name} forces a night mode", shipping.contains("AppCompatDelegate.setDefaultNightMode"))
            if (f.name != "MainActivity.kt" && f.name != "Theme.kt") {
                assertFalse("${f.name} asks the OS instead of the resolved theme", shipping.contains("isSystemInDarkTheme()"))
            }
        }
        val homeV3 = src("app/src/main/java/com/tappyai/app/home/HomeV3.kt")
        assertTrue("Home V3 follows the resolved ColorScheme", homeV3.contains("val dark = MaterialTheme.colorScheme.surface.luminance() < 0.5f"))
        val card = src("core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyCard.kt")
        assertTrue("TappyCard follows the resolved ColorScheme", card.contains("val isDark = colors.surface.luminance() < 0.5f"))
        val themeKt = src("core/designsystem/src/main/java/com/tappyai/core/designsystem/theme/Theme.kt")
        assertTrue("the theme's own default is the system", themeKt.contains("darkTheme: Boolean = isSystemInDarkTheme()"))
        assertTrue("the XML theme is DayNight, so the splash and system chrome follow the OS too", raw("app/src/main/res/values/themes.xml").contains("parent=\"Theme.AppCompat.DayNight.NoActionBar\""))
        assertFalse("no forced light/dark manifest theme", raw("app/src/main/AndroidManifest.xml").contains("Theme.TappyAI.Light") || raw("app/src/main/AndroidManifest.xml").contains("Theme.TappyAI.Dark"))
    }
}
