package com.tappyai.app.reviews.data

import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.network.NetworkError
import javax.inject.Inject

/**
 * Maps a [NetworkError] to a short, user-facing message for the Reviews feature, resolved via
 * [StringProvider] so it respects the user's selected app language. Centralized so every Reviews
 * screen surfaces failures consistently and never shows raw exception/HTTP text (the backend's own
 * error bodies are localized but core:network's mapper doesn't capture the body, so we key off the
 * status code). [toPostFailureMessage] adds the create-review-specific 401/409/413/429 cases.
 */
class ReviewErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {
    fun toUserMessage(error: NetworkError): String = when (error) {
        is NetworkError.NoConnectivity -> stringProvider.get(R.string.reviews_error_no_connectivity)
        is NetworkError.Timeout -> stringProvider.get(R.string.reviews_error_timeout)
        is NetworkError.Http -> when (error.code) {
            401 -> stringProvider.get(R.string.reviews_error_session_expired)
            in 500..599 -> stringProvider.get(R.string.reviews_error_server)
            else -> stringProvider.get(R.string.reviews_error_generic)
        }
        is NetworkError.Serialization -> stringProvider.get(R.string.reviews_error_generic)
        is NetworkError.Unknown -> stringProvider.get(R.string.reviews_error_generic)
    }

    /** Create-review has extra meaningful status codes the generic mapper doesn't cover. */
    fun toPostFailureMessage(error: NetworkError): String = when (error) {
        is NetworkError.Http -> when (error.code) {
            400 -> stringProvider.get(R.string.reviews_post_error_missing_fields)
            401 -> stringProvider.get(R.string.reviews_post_error_login_required)
            409 -> stringProvider.get(R.string.reviews_post_error_duplicate)
            413 -> stringProvider.get(R.string.reviews_post_error_too_long)
            429 -> stringProvider.get(R.string.reviews_post_error_rate_limited)
            else -> stringProvider.get(R.string.reviews_post_error_generic)
        }
        else -> toUserMessage(error)
    }
}
