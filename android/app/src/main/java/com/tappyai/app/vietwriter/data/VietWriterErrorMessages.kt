package com.tappyai.app.vietwriter.data

import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.network.NetworkError
import javax.inject.Inject

/** Maps a [NetworkError] to a short user-facing message for the VietWriter screen, resolved via
 *  [StringProvider]. 429 is the backend's per-minute burst cap (10 requests/60s per IP) — a
 *  short-wait message, not a "come back tomorrow" one like Translate/Scan's daily caps. */
class VietWriterErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {
    fun toUserMessage(error: NetworkError): String = when (error) {
        is NetworkError.NoConnectivity -> stringProvider.get(R.string.vietwriter_error_no_connectivity)
        is NetworkError.Timeout -> stringProvider.get(R.string.vietwriter_error_timeout)
        is NetworkError.Http -> when (error.code) {
            429 -> stringProvider.get(R.string.vietwriter_error_rate_limit)
            400 -> stringProvider.get(R.string.vietwriter_error_bad_request)
            in 500..599 -> stringProvider.get(R.string.vietwriter_error_server)
            else -> stringProvider.get(R.string.vietwriter_error_generic)
        }
        is NetworkError.Serialization -> stringProvider.get(R.string.vietwriter_error_generic)
        is NetworkError.Unknown -> stringProvider.get(R.string.vietwriter_error_generic)
    }
}
