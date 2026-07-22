package com.tappyai.features.auth.ui

import com.tappyai.core.common.StringProvider
import com.tappyai.core.network.NetworkError
import com.tappyai.features.auth.R
import javax.inject.Inject

/** `core:network` intentionally doesn't own user-facing copy (it's infrastructure, not UI) —
 *  each feature maps [NetworkError] to its own messages, resolved via [StringProvider] so the
 *  text respects the user's selected app language (see `LanguageManager`). */
class NetworkErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {
    fun toUserMessage(error: NetworkError): String = when (error) {
        is NetworkError.Http -> when (error.code) {
            401, 403 -> stringProvider.get(R.string.auth_error_invalid_code)
            429 -> stringProvider.get(R.string.auth_error_too_many_attempts)
            else -> stringProvider.get(R.string.auth_error_generic_with_code, error.code)
        }
        NetworkError.NoConnectivity -> stringProvider.get(R.string.auth_error_no_connectivity)
        NetworkError.Timeout -> stringProvider.get(R.string.auth_error_timeout)
        is NetworkError.Serialization -> stringProvider.get(R.string.auth_error_generic)
        is NetworkError.Unknown -> stringProvider.get(R.string.auth_error_generic)
    }
}
