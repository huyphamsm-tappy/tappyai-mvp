package com.tappyai.app.history.data

import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.network.NetworkError
import javax.inject.Inject

/**
 * Maps a [NetworkError] to a short user-facing message for the Chat History screen, resolved via
 * [StringProvider] so it respects the user's selected app language. Never surfaces raw
 * exception/HTTP text. A 401 from `/api/conversations` means the Bearer session is missing or
 * expired.
 */
class ChatHistoryErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {
    fun toUserMessage(error: NetworkError): String = when (error) {
        is NetworkError.NoConnectivity -> stringProvider.get(R.string.history_error_no_connectivity)
        is NetworkError.Timeout -> stringProvider.get(R.string.history_error_timeout)
        is NetworkError.Http -> when (error.code) {
            401 -> stringProvider.get(R.string.history_error_session_expired)
            in 500..599 -> stringProvider.get(R.string.history_error_server)
            else -> stringProvider.get(R.string.history_error_generic)
        }
        is NetworkError.Serialization -> stringProvider.get(R.string.history_error_generic)
        is NetworkError.Unknown -> stringProvider.get(R.string.history_error_generic)
    }
}
