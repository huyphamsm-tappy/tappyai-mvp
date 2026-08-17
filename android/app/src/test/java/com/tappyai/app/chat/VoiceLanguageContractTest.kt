package com.tappyai.app.chat

import com.tappyai.app.chat.data.MessageLanguage
import com.tappyai.app.chat.data.VoiceLocale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The read-aloud language contract on Android.
 *
 * TWO LANGUAGES, NOT ONE. `speechLocaleTag` is the APP language and drives voice INPUT — you
 * dictate in the language you chose to work in. The message language drives READ-ALOUD, and comes
 * from the backend, so an English-mode user receiving a Vietnamese reply hears Vietnamese.
 * Conflating them is the defect this work removes, so both halves are asserted here.
 *
 * The guard below deliberately does NOT ban the strings "vi-VN"/"en-US" — those are legitimate
 * OUTPUT locale values and the app must be free to produce them. What it bans is Kotlin deciding
 * WHICH one from the message text, which is the thing that would drift from the server's detector.
 */
class VoiceLanguageContractTest {

    private val chatViewModel = File("src/main/java/com/tappyai/app/chat/ChatViewModel.kt")
    private val repoFile = File("src/main/java/com/tappyai/app/chat/data/VoiceLanguageRepository.kt")
    private val realRepo = File("src/main/java/com/tappyai/app/chat/data/RealVoiceLanguageRepository.kt")

    // ---- the locale mapping -------------------------------------------------

    @Test
    fun `backend vi maps to vi-VN`() {
        assertEquals("vi-VN", VoiceLocale.tagFor("vi"))
    }

    @Test
    fun `backend en maps to en-US`() {
        assertEquals("en-US", VoiceLocale.tagFor("en"))
    }

    @Test
    fun `an unsupported language has no tag rather than a default`() {
        // The bug this prevents: `?: "vi-VN"` somewhere downstream.
        assertNull(VoiceLocale.tagFor("ja"))
        assertNull(VoiceLocale.tagFor("ko"))
        assertNull(VoiceLocale.tagFor(""))
        assertNull(VoiceLocale.tagFor(null))
    }

    @Test
    fun `casing from the wire does not break the mapping`() {
        assertEquals("vi-VN", VoiceLocale.tagFor("VI"))
    }

    // ---- the outcomes -------------------------------------------------------

    @Test
    fun `not speakable and failed are distinct outcomes`() {
        // Widened to the sealed type on purpose: comparing the two object types directly is a
        // Kotlin type error, and the property that matters is that a caller matching on
        // MessageLanguage can tell them apart.
        val notSpeakable: MessageLanguage = MessageLanguage.NotSpeakable
        val failed: MessageLanguage = MessageLanguage.Failed
        assertTrue(notSpeakable != failed)
    }

    @Test
    fun `the two failures produce different user-facing messages`() {
        // They deserve different sentences: one says do not bother, the other says try again.
        val src = chatViewModel.readText()
        assertTrue(src.contains("chat_tts_language_unsupported"))
        assertTrue(src.contains("chat_tts_language_failed"))
    }

    @Test
    fun `a speakable outcome carries a usable tag`() {
        val decided = MessageLanguage.Speakable(language = "vi", localeTag = "vi-VN")
        assertEquals("vi-VN", decided.localeTag)
    }

    // ---- no second detector in Kotlin --------------------------------------

    @Test
    fun `the repository asks the backend instead of inspecting the text`() {
        val src = realRepo.readText()
        assertTrue("must call the language endpoint", src.contains("api.detectLanguage"))
        // A local heuristic would look at the characters of the message.
        assertTrue("must not inspect the text itself", !src.contains("Regex(") && !src.contains("codePointAt"))
    }

    @Test
    fun `the view model does not derive the message language itself`() {
        val src = chatViewModel.readText()
        assertTrue("must consult the repository", src.contains("voiceLanguageRepository.messageLanguage"))
        // The specific regression: reading aloud with the APP language again.
        assertTrue(
            "read-aloud must not use speechLocaleTag",
            !src.contains("Locale.forLanguageTag(speechLocaleTag)")
        )
    }

    @Test
    fun `voice input still uses the app language`() {
        // Guards the OTHER half: this work must not have moved input off the UI language.
        val src = chatViewModel.readText()
        assertTrue(
            "voice input keeps the app language",
            src.contains("RecognizerIntent.EXTRA_LANGUAGE, speechLocaleTag")
        )
    }

    @Test
    fun `read-aloud refuses to speak without a decided language`() {
        val src = chatViewModel.readText()
        assertTrue(
            "speakFromOffset must bail out when no language was decided",
            src.contains("val tag = ttsLocaleTag ?: run {")
        )
    }

    @Test
    fun `there is no silent Vietnamese fallback anywhere in the read-aloud path`() {
        // The exact shape of the bug: defaulting to Vietnamese when the answer is unknown.
        for (f in listOf(chatViewModel, realRepo, repoFile)) {
            val src = f.readText()
            assertTrue(
                "${f.name} must not default to Vietnamese",
                !src.contains("?: \"vi-VN\"") && !src.contains("?: \"vi\"")
            )
        }
    }

    @Test
    fun `the guard above is not vacuous`() {
        // Prove the detector would fire on the pattern it bans, so a passing suite means something.
        val offending = "val tag = decided ?: \"vi-VN\""
        assertTrue(offending.contains("?: \"vi-VN\""))
    }

    // ---- the error actually reaches the user ---------------------------------

    private val chatScreen = File("src/main/java/com/tappyai/app/chat/ChatScreen.kt")
    private val stringsEn = File("src/main/res/values/strings_chat.xml")
    private val stringsVi = File("src/main/res/values-vi/strings_chat.xml")

    @Test
    fun `the screen observes ttsError and shows it`() {
        val src = chatScreen.readText()
        assertTrue("must observe the state", src.contains("viewModel.ttsError"))
        assertTrue("must react to changes", src.contains("LaunchedEffect(ttsError)"))
        assertTrue("must surface it", src.contains("Toast.makeText(ttsToastContext"))
    }

    @Test
    fun `the notice is cleared after showing so it does not replay`() {
        // Without this, a rotation would re-run the effect and show the same message again.
        assertTrue(chatScreen.readText().contains("viewModel.clearTtsError()"))
    }

    @Test
    fun `stopping playback shows nothing`() {
        // Silence is the correct feedback for "you pressed stop". stopTtsPlayback must not set an
        // error, or every ordinary stop would toast at the user.
        val src = chatViewModel.readText()
        val stop = src.substringAfter("private fun stopTtsPlayback").substringBefore("\n    }")
        assertTrue("stopTtsPlayback must not set ttsError", !stop.contains("ttsError ="))
    }

    @Test
    fun `no technical detail can reach the user through these strings`() {
        // The messages are built from string resources, never from an exception or HTTP status.
        val src = chatViewModel.readText()
        val onToggle = src.substringAfter("fun onToggleSpeak").substringBefore("\n    }")
        for (leak in listOf("e.message", "result.error", "HTTP", "http", "Google", "api.")) {
            assertTrue("onToggleSpeak must not surface $leak", !onToggle.contains(leak))
        }
    }

    @Test
    fun `both read-aloud messages exist in English and Vietnamese`() {
        for (key in listOf("chat_tts_language_unsupported", "chat_tts_language_failed")) {
            assertTrue("$key missing from EN", stringsEn.readText().contains("\"$key\""))
            assertTrue("$key missing from VI", stringsVi.readText().contains("\"$key\""))
        }
    }

    @Test
    fun `the two messages are actually different text in each language`() {
        // A copy-paste that left the same sentence for both outcomes would pass the presence check
        // above while telling the user the wrong thing half the time.
        for (file in listOf(stringsEn, stringsVi)) {
            val text = file.readText()
            val unsupported = text.substringAfter("\"chat_tts_language_unsupported\">").substringBefore("</string>")
            val failed = text.substringAfter("\"chat_tts_language_failed\">").substringBefore("</string>")
            assertTrue("${file.parentFile.name}: the two messages must differ", unsupported != failed)
            assertTrue("${file.parentFile.name}: unsupported message must not be empty", unsupported.isNotBlank())
        }
    }

    @Test
    fun `the language is asked once per playback, not per scrub`() {
        // speakFromOffset also backs resume/skip/speed; asking there would spend a request per drag.
        val src = chatViewModel.readText()
        val speakFromOffset = src.substringAfter("private fun speakFromOffset").substringBefore("\n    }")
        assertTrue(
            "speakFromOffset must not call the repository",
            !speakFromOffset.contains("voiceLanguageRepository")
        )
    }
}
