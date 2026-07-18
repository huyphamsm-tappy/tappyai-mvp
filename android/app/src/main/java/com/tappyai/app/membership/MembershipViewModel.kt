package com.tappyai.app.membership

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.membership.data.MembershipRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Membership status. Reads GET /api/subscription to show the real Pro/Free state and remaining
 * daily messages — the same display data as the web `/subscription` page. When signed out (401) or
 * the call fails, [remaining] stays null so the screen falls back to the static Free banner.
 * Read-only: purchase/upgrade is unavailable on Android (IAP/Stripe are backend-blocked).
 */
data class MembershipUiState(
    val isLoading: Boolean = false,
    val isPro: Boolean = false,
    val remaining: Int? = null,
    val freeDailyLimit: Int? = null,
)

@HiltViewModel
class MembershipViewModel @Inject constructor(
    private val repository: MembershipRepository,
    private val logger: LoggerProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MembershipUiState())
    val uiState: StateFlow<MembershipUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            when (val result = repository.getStatus()) {
                is NetworkResult.Success -> _uiState.update {
                    it.copy(
                        isLoading = false,
                        isPro = result.data.isPro,
                        remaining = result.data.remaining,
                        freeDailyLimit = result.data.freeDailyLimit,
                    )
                }
                is NetworkResult.Error -> {
                    // Signed-out (401) or network failure → keep the static Free banner (remaining=null).
                    logger.e(TAG, "Subscription load failed: ${result.error}")
                    _uiState.update { it.copy(isLoading = false) }
                }
            }
        }
    }

    private companion object {
        const val TAG = "MembershipViewModel"
    }
}
