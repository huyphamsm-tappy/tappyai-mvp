package com.tappyai.app.translate.data

import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.network.NetworkError
import javax.inject.Inject

/**
 * Maps a [NetworkError] to a short user-facing message for the Translate screen, resolved via
 * [StringProvider] so it respects the user's selected app language. Never surfaces raw
 * exception/HTTP text. 429 is the backend's daily-cap response (30/day per IP) and 400 covers both
 * empty and over-length text — the screen already blocks both client-side (disabled button while
 * blank, 2000-char input cap), so a 400 here means the two clients disagree, not a normal user path.
 */
class TranslateErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {
    fun toUserMessage(error: NetworkError): String = when (error) {
        is NetworkError.NoConnectivity -> stringProvider.get(R.string.translate_error_no_connectivity)
        is NetworkError.Timeout -> stringProvider.get(R.string.translate_error_timeout)
        is NetworkError.Http -> when (error.code) {
            429 -> stringProvider.get(R.string.translate_error_limit)
            400 -> stringProvider.get(R.string.translate_error_bad_request)
            in 500..599 -> stringProvider.get(R.string.translate_error_server)
            else -> stringProvider.get(R.string.translate_error_generic)
        }
        is NetworkError.Serialization -> stringProvider.get(R.string.translate_error_generic)
        is NetworkError.Unknown -> stringProvider.get(R.string.translate_error_generic)
    }
}
