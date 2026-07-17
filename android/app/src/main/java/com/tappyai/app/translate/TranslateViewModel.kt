package com.tappyai.app.translate

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.translate.data.TranslateErrorMessages
import com.tappyai.app.translate.data.TranslateRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

/**
 * State for the Translate screen (`/translate` on the web). Mirrors the web page's control flow
 * exactly: a bounded text input, a target-language picker, a translate call, then read-aloud/copy
 * on the result. The AI translation itself is entirely server-side (`POST /api/translate`); this
 * only transports text and renders whatever comes back.
 *
 * "Read aloud" uses Android's on-device [TextToSpeech] engine — the native analog of the web's
 * `window.speechSynthesis` — including the same defensive behavior: the web silently no-ops if
 * `window.speechSynthesis` is unavailable, so this silently no-ops (and reports [ttsAvailable] as
 * false) if the device has no TTS engine/voice data, rather than crashing or faking support.
 */
@HiltViewModel
class TranslateViewModel @Inject constructor(
    private val repository: TranslateRepository,
    private val logger: LoggerProvider,
    private val translateErrorMessages: TranslateErrorMessages,
    @ApplicationContext context: android.content.Context,
) : ViewModel() {

    var inputText by mutableStateOf("")
        private set

    var targetLanguage by mutableStateOf(LANGUAGES.first { it.code == DEFAULT_LANGUAGE_CODE })
        private set

    var translation by mutableStateOf<String?>(null)
        private set

    var isTranslating by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    var isSpeaking by mutableStateOf(false)
        private set

    /** False until the device's TTS engine finishes initializing successfully — mirrors the
     *  web's `!window.speechSynthesis` guard; the "read aloud" action no-ops while false. */
    var ttsAvailable by mutableStateOf(false)
        private set

    private var textToSpeech: TextToSpeech? = null

    init {
        textToSpeech = TextToSpeech(context) { status ->
            ttsAvailable = status == TextToSpeech.SUCCESS
            if (status != TextToSpeech.SUCCESS) {
                logger.w(TAG, "TextToSpeech init failed (status=$status) — read-aloud disabled")
            }
        }
        textToSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { isSpeaking = true }
            override fun onDone(utteranceId: String?) { isSpeaking = false }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) { isSpeaking = false }
            override fun onError(utteranceId: String?, errorCode: Int) { isSpeaking = false }
        })
    }

    fun onInputTextChange(value: String) {
        if (value.length <= MAX_TEXT_LENGTH) inputText = value
    }

    fun clear() {
        inputText = ""
        translation = null
        errorMessage = null
    }

    fun onTargetLanguageChange(language: Language) {
        targetLanguage = language
    }

    fun translate() {
        val text = inputText.trim()
        if (text.isEmpty() || isTranslating) return
        isTranslating = true
        errorMessage = null
        translation = null
        viewModelScope.launch {
            when (val result = repository.translate(text, targetLanguage.code)) {
                is NetworkResult.Success -> translation = result.data
                is NetworkResult.Error -> {
                    logger.e(TAG, "translate failed: ${result.error}")
                    errorMessage = translateErrorMessages.toUserMessage(result.error)
                }
            }
            isTranslating = false
        }
    }

    /** Toggle read-aloud for [text] in [ttsTag]'s locale — stops if already speaking, matching
     *  the web's toggle button. No-ops if the device has no working TTS engine. */
    fun speak(text: String, ttsTag: String) {
        val tts = textToSpeech ?: return
        if (!ttsAvailable) return
        if (isSpeaking) {
            tts.stop()
            isSpeaking = false
            return
        }
        tts.language = Locale.forLanguageTag(ttsTag)
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "translate-utterance")
    }

    override fun onCleared() {
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
        super.onCleared()
    }

    private companion object {
        const val TAG = "TranslateViewModel"
        // Matches the web textarea's maxLength (and the backend's own length validation).
        const val MAX_TEXT_LENGTH = 2000
    }
}
