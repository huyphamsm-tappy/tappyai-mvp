package com.tappyai.app.scan.data

import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.network.NetworkError
import javax.inject.Inject

/**
 * Maps a [NetworkError] to a short user-facing message for the Scan screen, resolved via
 * [StringProvider] so it respects the user's selected app language. Never surfaces raw
 * exception/HTTP text. 429 is the backend's daily-cap response (20 scans/day per IP) and 400
 * covers an oversized image (the screen already downsizes before sending, but the server's own
 * cap is the source of truth).
 */
class ScanErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {
    fun toUserMessage(error: NetworkError): String = when (error) {
        is NetworkError.NoConnectivity -> stringProvider.get(R.string.scan_error_no_connectivity)
        is NetworkError.Timeout -> stringProvider.get(R.string.scan_error_timeout)
        is NetworkError.Http -> when (error.code) {
            429 -> stringProvider.get(R.string.scan_error_limit)
            400 -> stringProvider.get(R.string.scan_error_bad_request)
            in 500..599 -> stringProvider.get(R.string.scan_error_server)
            else -> stringProvider.get(R.string.scan_error_generic)
        }
        is NetworkError.Serialization -> stringProvider.get(R.string.scan_error_generic)
        is NetworkError.Unknown -> stringProvider.get(R.string.scan_error_generic)
    }
}
