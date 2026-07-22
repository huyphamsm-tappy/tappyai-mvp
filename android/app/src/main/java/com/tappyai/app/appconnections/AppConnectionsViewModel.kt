package com.tappyai.app.appconnections

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.appconnections.data.AppConnectionsRepository
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
 * App-connections status. Reads GET /api/integrations to show which providers the user has already
 * connected (matching the web integrations list). Connecting is not available on Android — mobile
 * OAuth is backend-blocked — so the connect action stays a ComingSoon sheet; this only surfaces the
 * real connected state. On error / signed out, [connectedProviders] stays empty (all not-connected).
 */
data class AppConnectionsUiState(
    val isLoading: Boolean = false,
    val connectedProviders: Set<String> = emptySet(),
)

@HiltViewModel
class AppConnectionsViewModel @Inject constructor(
    private val repository: AppConnectionsRepository,
    private val logger: LoggerProvider,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AppConnectionsUiState())
    val uiState: StateFlow<AppConnectionsUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            when (val result = repository.getConnectedProviders()) {
                is NetworkResult.Success ->
                    _uiState.update { it.copy(isLoading = false, connectedProviders = result.data) }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Integrations load failed: ${result.error}")
                    _uiState.update { it.copy(isLoading = false) }
                }
            }
        }
    }

    private companion object {
        const val TAG = "AppConnectionsViewModel"
    }
}
