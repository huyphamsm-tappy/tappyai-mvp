package com.tappyai.app.vietwriter

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.vietwriter.data.VietWriterErrorMessages
import com.tappyai.app.vietwriter.data.VietWriterRepository
import com.tappyai.app.vietwriter.data.VietWriterResult
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for VietWriter (`/viet-content` on the web): a Vietnamese social-caption generator, not a
 * grammar/rewrite tool — topic + platform/tone/length selection → `POST /api/viet-content` →
 * caption + hashtags. No sign-in required (IP rate-limited, 10 requests/60s — tighter than
 * Translate/Scan's daily caps).
 */
@HiltViewModel
class VietWriterViewModel @Inject constructor(
    private val repository: VietWriterRepository,
    private val logger: LoggerProvider,
    private val vietWriterErrorMessages: VietWriterErrorMessages,
) : ViewModel() {

    var topic by mutableStateOf("")
        private set
    var platform by mutableStateOf(VietWriterPlatform.Facebook)
        private set
    var tone by mutableStateOf(VietWriterTone.Youthful)
        private set
    var length by mutableStateOf(VietWriterLength.Medium)
        private set

    var isGenerating by mutableStateOf(false)
        private set
    var result by mutableStateOf<VietWriterResult?>(null)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set

    fun onTopicChange(value: String) {
        if (value.length <= MAX_TOPIC_LENGTH) topic = value
    }

    fun onPlatformChange(value: VietWriterPlatform) { platform = value }
    fun onToneChange(value: VietWriterTone) { tone = value }
    fun onLengthChange(value: VietWriterLength) { length = value }

    fun generate() {
        val trimmed = topic.trim()
        if (trimmed.isEmpty() || isGenerating) return
        isGenerating = true
        errorMessage = null
        result = null
        viewModelScope.launch {
            when (val apiResult = repository.generate(trimmed, platform.wireValue, tone.wireValue, length.wireValue)) {
                is NetworkResult.Success -> result = apiResult.data
                is NetworkResult.Error -> {
                    logger.e(TAG, "VietWriter generate failed: ${apiResult.error}")
                    errorMessage = vietWriterErrorMessages.toUserMessage(apiResult.error)
                }
            }
            isGenerating = false
        }
    }

    /** "Rewrite" — mirrors the web's reset button: clears the result so the same form can be
     *  resubmitted (topic/platform/tone/length are left as-is, not cleared). */
    fun onReset() {
        result = null
        errorMessage = null
    }

    private companion object {
        const val TAG = "VietWriterViewModel"
        const val MAX_TOPIC_LENGTH = 500
    }
}
