package com.tappyai.app.profile.data

import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.network.NetworkError
import javax.inject.Inject

/**
 * Maps a [NetworkError] from [com.tappyai.app.profile.SettingsViewModel.signOut] to a short
 * user-facing message, resolved via [StringProvider] so it respects the user's selected app
 * language. Mirrors [com.tappyai.app.account.data.AccountErrorMessages]'s shape.
 */
class SettingsErrorMessages @Inject constructor(
    private val stringProvider: StringProvider,
) {
    fun toSignOutMessage(error: NetworkError): String = when (error) {
        is NetworkError.NoConnectivity -> stringProvider.get(R.string.settings_error_no_connectivity)
        is NetworkError.Timeout -> stringProvider.get(R.string.settings_error_timeout)
        else -> stringProvider.get(R.string.settings_error_generic)
    }
}
