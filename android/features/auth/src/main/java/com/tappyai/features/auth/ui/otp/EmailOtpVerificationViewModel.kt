package com.tappyai.features.auth.ui.otp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.R
import com.tappyai.features.auth.data.AuthRepository
import com.tappyai.features.auth.navigation.AuthRoute
import com.tappyai.features.auth.ui.NetworkErrorMessages
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Deliberately doesn't navigate on successful verification — same reasoning as
 * [com.tappyai.features.auth.ui.login.LoginViewModel]: the top-level `AuthGate` (M6, `:app`)
 * reacts to `AuthRepository.isSignedIn` becoming true and switches graphs itself.
 */
@HiltViewModel
class EmailOtpVerificationViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val authRepository: AuthRepository,
    private val networkErrorMessages: NetworkErrorMessages,
    private val stringProvider: StringProvider,
) : ViewModel() {

    val email: String = savedStateHandle.toRoute<AuthRoute.EmailOtpVerification>().email

    var code by mutableStateOf("")
        private set

    private val _uiState = MutableStateFlow<UiState<Unit>>(UiState.Idle)
    val uiState: StateFlow<UiState<Unit>> = _uiState.asStateFlow()

    fun onCodeChange(value: String) {
        code = value
    }

    fun onVerifyClick() {
        val codeValue = code.trim()
        if (codeValue.isEmpty()) {
            _uiState.value = UiState.Error(stringProvider.get(R.string.auth_enter_code_first))
            return
        }

        viewModelScope.launch {
            _uiState.value = UiState.Loading
            when (val result = authRepository.verifyEmailOtp(email, codeValue)) {
                is NetworkResult.Success -> _uiState.value = UiState.Success(Unit)
                is NetworkResult.Error -> _uiState.value = UiState.Error(networkErrorMessages.toUserMessage(result.error))
            }
        }
    }
}
