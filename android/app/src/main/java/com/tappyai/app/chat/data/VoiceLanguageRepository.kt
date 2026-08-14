package com.tappyai.app.chat.data

/**
 * Which language a reply should be READ ALOUD in.
 *
 * Deliberately NOT decided here. The backend's `detectLang()` was shaped by two production
 * incidents in opposite directions — an English sentence flipped to Vietnamese by a curly quote,
 * then a Vietnamese place name flipping an English sentence back — and a Kotlin copy would drift
 * from it the first time either is corrected. Android asks; the server answers.
 *
 * This is a different question from the one [com.tappyai.app.chat.ChatViewModel.speechLocaleTag]
 * answers. That is the APP language and drives voice INPUT: you dictate in the language you chose
 * to work in. This is the MESSAGE language and drives read-aloud, so an English-mode user who
 * receives a Vietnamese reply hears Vietnamese. Conflating the two is the defect this replaces.
 */
interface VoiceLanguageRepository {
    suspend fun messageLanguage(text: String): MessageLanguage
}

/**
 * Closed set of outcomes. There is deliberately no "unknown, assume Vietnamese" case — silently
 * reading an English reply in a Vietnamese voice is the failure this whole path exists to prevent.
 */
sealed interface MessageLanguage {
    /** The backend named a language we can speak. [localeTag] is ready for `Locale.forLanguageTag`. */
    data class Speakable(val language: String, val localeTag: String) : MessageLanguage

    /** The backend answered, but this reply is in a language we have no voice for. Stay silent. */
    data object NotSpeakable : MessageLanguage

    /** The call failed. Also stay silent — a network error is not evidence about a language. */
    data object Failed : MessageLanguage
}

/**
 * Backend language code -> Android BCP-47 tag.
 *
 * The mapping lives in exactly one place so a third language is one entry here plus the server's
 * own config, not a search for every `if (lang == "vi")` in the app. Anything unrecognised returns
 * null rather than a default: the caller must then not speak.
 */
object VoiceLocale {
    private val TAGS = mapOf(
        "vi" to "vi-VN",
        "en" to "en-US",
    )

    fun tagFor(language: String?): String? = language?.let { TAGS[it.lowercase()] }
}
