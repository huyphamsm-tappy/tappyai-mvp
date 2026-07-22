package com.tappyai.app.groupdining.data

import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.network.NetworkError
import javax.inject.Inject

/**
 * [context] tailors the ambiguous 400/403 cases to the action in flight, since the backend reuses
 * 400 for both "invalid input" and "group is full (max 10)", and 403 only occurs on suggest
 * (creator-only).
 */
enum class GroupAction { Create, Load, Join, Suggest }

/**
 * Maps a [NetworkError] to a short user-facing message for the Group Dining screens, resolved via
 * [StringProvider] so it respects the user's selected app language. Raw exception/HTTP/DB text is
 * never surfaced — only status-code-derived, human-readable copy.
 */
class GroupErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {
    fun toUserMessage(error: NetworkError, action: GroupAction): String = when (error) {
        is NetworkError.NoConnectivity -> stringProvider.get(R.string.groupdining_error_no_connectivity)
        is NetworkError.Timeout -> stringProvider.get(R.string.groupdining_error_timeout)
        is NetworkError.Http -> when (error.code) {
            401 -> stringProvider.get(R.string.groupdining_error_session_expired)
            403 -> stringProvider.get(R.string.groupdining_error_creator_only)
            404 -> stringProvider.get(R.string.groupdining_not_found_message)
            429 -> stringProvider.get(R.string.groupdining_error_rate_limited)
            400 -> when (action) {
                GroupAction.Join -> stringProvider.get(R.string.groupdining_error_join_400)
                GroupAction.Create -> stringProvider.get(R.string.groupdining_error_create_400)
                else -> stringProvider.get(R.string.groupdining_error_generic)
            }
            in 500..599 -> stringProvider.get(R.string.groupdining_error_server)
            else -> stringProvider.get(R.string.groupdining_error_generic)
        }
        is NetworkError.Serialization -> stringProvider.get(R.string.groupdining_error_generic)
        is NetworkError.Unknown -> stringProvider.get(R.string.groupdining_error_generic)
    }
}
