package com.tappyai.features.auth.ui.login

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.navigation.TappyNavigator
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.R
import com.tappyai.features.auth.data.AuthRepository
import com.tappyai.features.auth.data.GoogleSignInClient
import com.tappyai.features.auth.navigation.AuthRoute
import com.tappyai.features.auth.ui.NetworkErrorMessages
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Deliberately does **not** navigate away on a successful Google/Facebook sign-in — the
 * top-level `AuthGate` (M6, `:app`) observes `AuthRepository.isSignedIn` reactively and
 * switches graphs itself. `features:auth` has no business knowing what destination exists
 * *after* auth (that's `:app`'s composition-root concern, and would otherwise leak a
 * cross-module route dependency). This ViewModel only owns navigation *within* its own auth
 * graph — e.g. Login → EmailOtpVerification.
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val googleSignInClient: GoogleSignInClient,
    private val navigator: TappyNavigator,
    private val networkErrorMessages: NetworkErrorMessages,
    private val stringProvider: StringProvider,
) : ViewModel() {

    var email by mutableStateOf("")
        private set

    private val _uiState = MutableStateFlow<UiState<Unit>>(UiState.Idle)
    val uiState: StateFlow<UiState<Unit>> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        email = value
    }

    fun onGoogleSignInClick(context: Context) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            val credentialResult = googleSignInClient.requestGoogleIdToken(context)
            val credential = credentialResult.getOrNull()
            if (credential == null) {
                _uiState.value = UiState.Error(
                    credentialResult.exceptionOrNull()?.message
                        ?: stringProvider.get(R.string.auth_google_signin_cancelled),
                )
                return@launch
            }

            when (val result = authRepository.signInWithGoogleIdToken(credential.idToken, credential.nonce)) {
                is NetworkResult.Success -> _uiState.value = UiState.Success(Unit)
                is NetworkResult.Error -> _uiState.value = UiState.Error(networkErrorMessages.toUserMessage(result.error))
            }
        }
    }

    fun onFacebookSignInClick() {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            // Success here only means the browser/Custom-Tab launched — the flow itself
            // completes later via the tappyai://auth-callback deep link (M7), not this call.
            when (val result = authRepository.startFacebookSignIn()) {
                is NetworkResult.Success -> _uiState.value = UiState.Idle
                is NetworkResult.Error -> _uiState.value = UiState.Error(networkErrorMessages.toUserMessage(result.error))
            }
        }
    }

    /**
     * Zalo sign-in — architecturally like Google (a Custom Tab that needs an Activity [context]),
     * not like Facebook (Supabase-internal). Opens the web Zalo OAuth flow in a Chrome Custom Tab
     * via [ZaloSignInClient]; the session lands later through the `tappyai://auth-callback` deep
     * link (`AuthRepository.handleOAuthRedirectIntent`), the same completion path Google/Facebook
     * use — so, like them, this does not flip UI state or navigate itself.
     */
    fun onZaloSignInClick(context: Context) {
        authRepository.startZaloSignIn(context)
    }

    fun onSendEmailOtpClick() {
        val emailValue = email.trim()
        if (emailValue.isEmpty()) {
            _uiState.value = UiState.Error(stringProvider.get(R.string.auth_enter_email_first))
            return
        }

        viewModelScope.launch {
            _uiState.value = UiState.Loading
            when (val result = authRepository.sendEmailOtp(emailValue)) {
                is NetworkResult.Success -> {
                    _uiState.value = UiState.Idle
                    navigator.navigateTo(AuthRoute.EmailOtpVerification(emailValue))
                }
                is NetworkResult.Error -> _uiState.value = UiState.Error(networkErrorMessages.toUserMessage(result.error))
            }
        }
    }
}
