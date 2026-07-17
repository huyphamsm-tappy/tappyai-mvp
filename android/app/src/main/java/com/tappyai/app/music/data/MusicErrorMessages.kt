package com.tappyai.app.music.data

import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.network.NetworkError
import javax.inject.Inject

/** Maps a [NetworkError] to a short user-facing message for the Music screens, resolved via
 *  [StringProvider] so it respects the user's selected app language. */
class MusicErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {
    fun toUserMessage(error: NetworkError): String = when (error) {
        is NetworkError.NoConnectivity -> stringProvider.get(R.string.music_error_no_connectivity)
        is NetworkError.Timeout -> stringProvider.get(R.string.music_error_timeout)
        is NetworkError.Http -> when (error.code) {
            401 -> stringProvider.get(R.string.music_error_session_expired)
            in 500..599 -> stringProvider.get(R.string.music_error_server)
            else -> stringProvider.get(R.string.music_error_generic)
        }
        is NetworkError.Serialization -> stringProvider.get(R.string.music_error_generic)
        is NetworkError.Unknown -> stringProvider.get(R.string.music_error_generic)
    }
}
