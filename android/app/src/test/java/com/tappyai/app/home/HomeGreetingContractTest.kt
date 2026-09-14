package com.tappyai.app.home

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The V3 hero greeting contract (owner decision 2026-09-14, after the historical audit): the
 * approved V3 web line, static and name-personalised — `v3.home.greetUser` "Hi {name}!" /
 * `v3.home.greetGuest` "Chào bạn!" — on Android through `home_v3_greeting_named` /
 * `home_v3_greeting_generic` and the existing `HomeViewModel.userName`. The pre-V3 time-of-day
 * engine ([HomeGreeting]) stays in the repository (its own tests pin it) but is NOT this hero's
 * source; the "time × day × five domains" system is the Suggested Prompts engine, not the greeting.
 */
class HomeGreetingContractTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private val screen get() = src("app/src/main/java/com/tappyai/app/home/HomeScreen.kt")

    // The resource files spell the wave as the Android escape `👋` (U+1F44B, 👋).
    private val wave = "\\uD83D\\uDC4B"

    @Test
    fun `logged-in users get Hi name, guests get the V3 guest line, from the existing strings and userName`() {
        val hero = screen.substring(screen.indexOf("private fun V3HeroSection(userName: String?)"), screen.indexOf("private fun BoxScope.Sparkle("))
        assertTrue(hero.contains("?.let { stringResource(R.string.home_v3_greeting_named, it) }"))
        assertTrue(hero.contains("?: stringResource(R.string.home_v3_greeting_generic)"))
        assertTrue("the name comes from the existing ViewModel state", screen.contains("val userName by viewModel.userName.collectAsStateWithLifecycle()") && screen.contains("V3HeroSection(userName = userName)"))
        assertTrue("the supporting line is the static V3 tagline", hero.contains("text = stringResource(R.string.home_v3_hero_tagline),"))
        val vi = src("app/src/main/res/values-vi/strings_home.xml")
        val en = src("app/src/main/res/values/strings_home.xml")
        assertTrue("guest = the web's greetGuest", vi.contains("""<string name="home_v3_greeting_generic">Chào bạn! $wave</string>"""))
        assertTrue(vi.contains("""<string name="home_v3_greeting_named">Hi %1${'$'}s! $wave</string>"""))
        assertTrue(en.contains("""<string name="home_v3_greeting_generic">Hello! $wave</string>"""))
        assertTrue(en.contains("""<string name="home_v3_greeting_named">Hi %1${'$'}s! $wave</string>"""))
    }

    @Test
    fun `the V3 hero does not consume the pre-V3 time-of-day engine`() {
        assertFalse(screen.contains("viewModel.greeting("))
        assertFalse(screen.contains("HomeGreeting.heroText("))
        assertFalse(screen.contains("resources_are_english"))
        assertTrue("mascot, glow and sparkles untouched", screen.contains("painterResource(R.drawable.tappy_wave)") && screen.contains("HomeV3.HeroGlow") && screen.contains("Sparkle(size = 12.dp"))
    }
}
