package com.tappyai.app.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Feature usage guidance on Android.
 *
 * The failure worth guarding is the quiet one. Android resolves a missing `values-vi` string by
 * falling back to `values/`, so a forgotten translation does not crash and does not show a resource
 * id — it shows ENGLISH, mid-way down an otherwise Vietnamese screen. Nothing in the type system
 * notices, and `MissingTranslation` lint only fires when it is enabled and read. So the parity
 * assertions below compare the two files directly.
 *
 * The second guard is about honesty rather than translation: the screen must not document a feature
 * that the app does not have. That cannot be asserted from strings alone, so the tests that matter
 * for it read the source of the feature being described — the read-aloud section is only allowed to
 * exist because ChatViewModel really drives TextToSpeech, and the Tappy-sound section only because
 * SettingsScreen really renders that toggle.
 */
class HowToUseGuidanceTest {

    private val stringsEn = File("src/main/res/values/strings_guide.xml")
    private val stringsVi = File("src/main/res/values-vi/strings_guide.xml")
    private val settingsEn = File("src/main/res/values/strings_settings.xml")
    private val settingsVi = File("src/main/res/values-vi/strings_settings.xml")
    private val screen = File("src/main/java/com/tappyai/app/profile/HowToUseScreen.kt")
    private val settingsScreen = File("src/main/java/com/tappyai/app/profile/SettingsScreen.kt")
    private val profileTab = File("src/main/java/com/tappyai/app/profile/ProfileTab.kt")
    private val profileRoute = File("src/main/java/com/tappyai/app/profile/ProfileRoute.kt")

    /** name -> value for every <string> in a resource file. */
    private fun strings(file: File): Map<String, String> {
        assertTrue("${file.path} is missing", file.exists())
        return Regex("""<string name="([^"]+)">(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)
            .findAll(file.readText())
            .associate { it.groupValues[1] to it.groupValues[2] }
    }

    /** The twelve sections the screen renders, in order. */
    private val sections = listOf(
        "chat", "food", "travel", "product", "readaloud", "notifications",
        "tappysound", "reviews", "saves", "tools", "account", "limits",
    )

    // ---- locale parity ------------------------------------------------------

    @Test
    fun `every guidance string exists in both locales`() {
        val en = strings(stringsEn)
        val vi = strings(stringsVi)
        assertEquals("keys differ between values/ and values-vi/", en.keys.sorted(), vi.keys.sorted())
    }

    @Test
    fun `no guidance string is blank in either locale`() {
        for ((file, map) in listOf(stringsEn to strings(stringsEn), stringsVi to strings(stringsVi))) {
            val blank = map.filterValues { it.isBlank() }.keys
            assertTrue("blank strings in ${file.path}: $blank", blank.isEmpty())
        }
    }

    @Test
    fun `vietnamese is actually translated, not a copy of english`() {
        val en = strings(stringsEn)
        val vi = strings(stringsVi)
        val identical = en.filter { (k, v) -> vi[k] == v }.keys
        assertTrue("untranslated (identical to English): $identical", identical.isEmpty())
    }

    @Test
    fun `every section has a title and a body in both locales`() {
        val en = strings(stringsEn)
        val vi = strings(stringsVi)
        for (section in sections) {
            for (suffix in listOf("title", "body")) {
                val key = "guide_${section}_$suffix"
                assertTrue("$key missing from values/", en.containsKey(key))
                assertTrue("$key missing from values-vi/", vi.containsKey(key))
            }
        }
    }

    @Test
    fun `the screen renders every section that the resources define`() {
        // Catches the reverse drift: a string added to the XML but never shown.
        val source = screen.readText()
        val defined = strings(stringsEn).keys.filter { it.endsWith("_body") }
        val unrendered = defined.filter { !source.contains("R.string.$it") }
        assertTrue("defined but never rendered: $unrendered", unrendered.isEmpty())
    }

    // ---- the content is instructions, not prose ------------------------------

    @Test
    fun `sections that teach a flow carry numbered steps`() {
        val en = strings(stringsEn)
        val vi = strings(stringsVi)
        val withSteps = listOf("chat", "food", "travel", "product", "readaloud", "notifications", "tappysound", "reviews", "saves")
        for (section in withSteps) {
            for ((label, map) in listOf("en" to en, "vi" to vi)) {
                val body = map.getValue("guide_${section}_body")
                assertTrue("guide_${section}_body ($label) has no step 1.", body.contains("1."))
                assertTrue("guide_${section}_body ($label) has no step 2.", body.contains("2."))
            }
        }
    }

    // ---- nothing is documented that does not exist ---------------------------

    @Test
    fun `the read-aloud section describes a feature this app actually has`() {
        val chat = File("src/main/java/com/tappyai/app/chat/ChatViewModel.kt").readText()
        assertTrue(
            "guidance describes read-aloud but ChatViewModel no longer drives TextToSpeech",
            chat.contains("android.speech.tts.TextToSpeech"),
        )
    }

    @Test
    fun `the Tappy-sound section describes a toggle the user can actually reach`() {
        assertTrue(
            "guidance tells the user to toggle the Tappy sound in Settings, but SettingsScreen does not render it",
            settingsScreen.readText().contains("tappyNotificationSoundEnabled"),
        )
    }

    @Test
    fun `the guidance never claims delivery has been verified`() {
        // V2-03 has had no production FCM E2E. The text may describe behaviour; it may not
        // assert that notifications are proven to arrive.
        val bodies = strings(stringsEn).values.joinToString(" ").lowercase()
        for (claim in listOf("verified", "guaranteed", "always arrive")) {
            assertFalse("guidance claims \"$claim\" about notifications", bodies.contains(claim))
        }
    }

    // ---- reachable from Settings --------------------------------------------

    @Test
    fun `the Settings entry point is localized in both locales and differs`() {
        val en = strings(settingsEn)["settings_how_to_use"]
        val vi = strings(settingsVi)["settings_how_to_use"]
        assertTrue("settings_how_to_use missing from values/", !en.isNullOrBlank())
        assertTrue("settings_how_to_use missing from values-vi/", !vi.isNullOrBlank())
        assertTrue("settings_how_to_use is not translated", en != vi)
    }

    @Test
    fun `Settings renders the row and routes it to the guide`() {
        val source = settingsScreen.readText()
        assertTrue("Settings has no How-to-use row", source.contains("R.string.settings_how_to_use"))
        assertTrue("the row is not wired to onOpenGuide", source.contains("onClick = onOpenGuide"))
    }

    @Test
    fun `the route exists and the nav graph shows the screen`() {
        assertTrue("ProfileRoute.Guide is not declared", profileRoute.readText().contains("data object Guide"))
        val tab = profileTab.readText()
        assertTrue("no composable for ProfileRoute.Guide", tab.contains("composable<ProfileRoute.Guide>"))
        assertTrue("the Guide destination does not show HowToUseScreen", tab.contains("HowToUseScreen("))
        assertTrue("Settings is not given onOpenGuide", tab.contains("onOpenGuide ="))
    }

    @Test
    fun `the screen holds no hardcoded prose`() {
        // Long literals in Kotlin are how Terms and Privacy ended up English-only. Every
        // user-visible string here must come from resources instead.
        //
        // Comments are stripped FIRST. Scanning the raw file matched the prose between two
        // unrelated quotes inside this file's own KDoc and failed on a file that has no string
        // literals at all — a guard that fires on its own documentation teaches people to
        // delete it.
        val code = screen.readText()
            .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
            .replace(Regex("""//[^\n]*"""), "")
        // \n excluded because a plain Kotlin literal cannot span lines — without it the match
        // runs between two unrelated quotes and reports the code in between. And prose is
        // distinguished from a long resource identifier by containing a space.
        val literals = Regex(""""([^"\\\n]{20,})"""")
            .findAll(code)
            .map { it.groupValues[1] }
            .filter { it.contains(' ') }
            .toList()
        assertTrue("hardcoded prose in HowToUseScreen: $literals", literals.isEmpty())
    }
}
