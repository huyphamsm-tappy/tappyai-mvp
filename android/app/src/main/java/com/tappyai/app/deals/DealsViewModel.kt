package com.tappyai.app.deals

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.deals.data.DealsRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Deals screen (`/deals` on the web) — loads the active partner-deal pool once from
 * `GET /api/deals`. No pagination/filtering (the web has none either); tapping a card bumps the
 * popularity counter and opens [Deal.officialUrl] externally, same as the web's
 * `<a target="_blank">`.
 */
@HiltViewModel
class DealsViewModel @Inject constructor(
    private val repository: DealsRepository,
    private val logger: LoggerProvider,
    private val stringProvider: StringProvider,
) : ViewModel() {

    var uiState by mutableStateOf<UiState<List<Deal>>>(UiState.Loading)
        private set

    private var loadJob: Job? = null

    init {
        load()
    }

    private fun load() {
        loadJob?.cancel()
        uiState = UiState.Loading
        loadJob = viewModelScope.launch {
            when (val result = repository.getDeals()) {
                is NetworkResult.Success -> {
                    uiState = if (result.data.isEmpty()) UiState.Empty else UiState.Success(result.data)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Deals load failed: ${result.error}")
                    uiState = UiState.Error(stringProvider.get(R.string.deals_error_message))
                }
            }
        }
    }

    fun retry() = load()

    /**
     * Fire-and-forget popularity counter for an opened deal (web parity: `DealsView.tsx` posts
     * `/api/deals/{id}/click` on card click).
     *
     * Launched on [viewModelScope] and never awaited by the caller, so the link opens immediately
     * whatever the network does. The repository already swallows failures; nothing is reported.
     */
    fun onDealOpen(deal: Deal) {
        viewModelScope.launch { repository.recordClick(deal.id) }
    }

    private companion object {
        const val TAG = "DealsViewModel"
    }
}
