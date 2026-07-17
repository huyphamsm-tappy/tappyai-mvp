package com.tappyai.app.profile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.language.AppLanguage
import com.tappyai.app.language.LanguageManager
import com.tappyai.app.profile.data.SettingsErrorMessages
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Settings screen's Sign Out row — the one previously-missing piece of the web's
 * `SignOutButton` (`supabase.auth.signOut()` → navigate to `/login`). [AuthRepository.signOut]
 * already exists (Phase 1B) and already tears down the Supabase session + clears
 * [com.tappyai.core.security.TokenProvider]; once it completes, [AuthSessionState] flips to
 * `Unauthenticated` and `AppNavHost`'s own reactive `LaunchedEffect` (already built, unrelated to
 * this screen) navigates to Login with the whole back stack cleared — so this ViewModel needs no
 * navigation callback of its own, exactly mirroring how the web's redirect is a side effect of the
 * auth state change, not something `SignOutButton` drives directly.
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val languageManager: LanguageManager,
    private val logger: LoggerProvider,
    private val settingsErrorMessages: SettingsErrorMessages,
) : ViewModel() {

    var isSigningOut by mutableStateOf(false)
        private set

    var errorMessage by mutableStateOf<String?>(null)
        private set

    /** Defaults to English — matches this build's own current all-hardcoded-English UI when the
     *  user hasn't explicitly picked a language yet. */
    var language by mutableStateOf(languageManager.current ?: AppLanguage.English)
        private set

    fun selectLanguage(next: AppLanguage) {
        if (language == next) return
        language = next
        viewModelScope.launch { languageManager.setLanguage(next) }
    }

    fun signOut() {
        if (isSigningOut) return
        isSigningOut = true
        errorMessage = null
        viewModelScope.launch {
            when (val result = authRepository.signOut()) {
                // AppNavHost reacts to the session change and tears this screen down — reset the
                // flag anyway rather than relying on that timing, so the row never reads "Signing
                // out..." indefinitely if the screen happens to still be composed for a moment.
                is NetworkResult.Success -> isSigningOut = false
                is NetworkResult.Error -> {
                    logger.e(TAG, "signOut failed: ${result.error}")
                    errorMessage = settingsErrorMessages.toSignOutMessage(result.error)
                    isSigningOut = false
                }
            }
        }
    }

    private companion object {
        const val TAG = "SettingsViewModel"
    }
}
