package com.tappyai.app.scamshield

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.scamshield.data.ScamShieldErrorMessages
import com.tappyai.app.scamshield.data.ScamShieldOutcome
import com.tappyai.app.scamshield.data.ScamShieldRepository
import com.tappyai.app.scamshield.data.ScamShieldResultDto
import com.tappyai.core.logging.LoggerProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** URL / QR — the web's two-tab switcher (`type Tab = 'url' | 'qr'`). */
enum class ScamShieldTab { URL, QR }

/**
 * State for Scam Shield, a port of the web's `ScamShieldView.tsx` (main @ 11453de).
 *
 * The client is deliberately thin: it collects a URL or an image, posts it, and renders whatever
 * the server returns. No scoring, no thresholds, no QR decoding, no provider logic, no brand
 * matching happens here — all of that stays under `src/lib/scam-shield/` on the server.
 */
@HiltViewModel
class ScamShieldViewModel @Inject constructor(
    private val repository: ScamShieldRepository,
    private val errorMessages: ScamShieldErrorMessages,
    private val logger: LoggerProvider,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    var tab by mutableStateOf(ScamShieldTab.URL)
        private set
    var url by mutableStateOf("")
        private set
    var loading by mutableStateOf(false)
        private set
    var result by mutableStateOf<ScamShieldResultDto?>(null)
        private set
    var errorMessage by mutableStateOf<String?>(null)
        private set

    fun onUrlChange(value: String) { url = value }

    /** Switching tabs clears both the result and the error — same as the web's tab buttons. */
    fun onTabSelected(next: ScamShieldTab) {
        tab = next
        result = null
        errorMessage = null
    }

    /** Web: `if (!url.trim() || loading) return`. */
    fun onCheckUrl() {
        val trimmed = url.trim()
        if (trimmed.isEmpty() || loading) return
        run(ScamShieldErrorMessages.Mode.URL) { repository.check(trimmed) }
    }

    /**
     * The picked image is posted exactly as it was read — the web sends the raw `File` with no
     * resizing or re-encoding, so anything over the server's 5 MB cap is rejected server-side as
     * `too_large` on both platforms. (Scan resizes; Scam Shield does not.)
     */
    fun onQrImagePicked(uri: Uri) {
        if (loading) return
        viewModelScope.launch {
            loading = true
            result = null
            errorMessage = null
            try {
                val bytes = withContext(Dispatchers.IO) {
                    try {
                        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    } catch (e: Exception) {
                        logger.w(TAG, "Could not read picked image: ${e.message}")
                        null
                    }
                }
                if (bytes == null) {
                    // Nothing left the device, so this is the local equivalent of the web's
                    // thrown fetch — same copy as a transport failure.
                    errorMessage = errorMessages.toUserMessage(
                        ScamShieldOutcome.TransportError,
                        ScamShieldErrorMessages.Mode.QR,
                    )
                    return@launch
                }
                val mime = context.contentResolver.getType(uri) ?: DEFAULT_IMAGE_MIME
                apply(repository.checkQr(bytes, mime), ScamShieldErrorMessages.Mode.QR)
            } finally {
                loading = false
            }
        }
    }

    private fun run(mode: ScamShieldErrorMessages.Mode, call: suspend () -> ScamShieldOutcome) {
        viewModelScope.launch {
            loading = true
            result = null
            errorMessage = null
            try {
                apply(call(), mode)
            } finally {
                loading = false
            }
        }
    }

    private fun apply(outcome: ScamShieldOutcome, mode: ScamShieldErrorMessages.Mode) {
        when (outcome) {
            is ScamShieldOutcome.Success -> result = outcome.result
            else -> errorMessage = errorMessages.toUserMessage(outcome, mode)
        }
    }

    private companion object {
        const val TAG = "ScamShieldViewModel"
        /** Only used when the content resolver cannot report a type; the part type is not what
         *  the route validates (it checks the request's multipart content-type). */
        const val DEFAULT_IMAGE_MIME = "image/jpeg"
    }
}
