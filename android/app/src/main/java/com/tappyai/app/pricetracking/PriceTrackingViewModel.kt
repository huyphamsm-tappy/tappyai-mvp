package com.tappyai.app.pricetracking

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.pricetracking.data.PriceTrackingErrorMessages
import com.tappyai.app.pricetracking.data.PriceTrackingRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Backs the Price Tracking dashboard with real data from `GET /api/price-watch`. Refresh reloads
 * the list; delete cancels a watch via `DELETE /api/price-watch` with an optimistic removal that
 * reverts on failure (the delete contract is a definitive soft-cancel, so it's optimistic-safe).
 * Transient feedback ("Updated", errors) is delivered as one-shot [messages] the screen shows in a
 * snackbar. Active/triggered split and formatting stay in the (unchanged) UI.
 */
@HiltViewModel
class PriceTrackingViewModel @Inject constructor(
    private val repository: PriceTrackingRepository,
    private val logger: LoggerProvider,
    private val priceTrackingErrorMessages: PriceTrackingErrorMessages,
    private val stringProvider: StringProvider,
) : ViewModel() {

    var watches by mutableStateOf<List<PriceWatch>>(emptyList())
        private set
    var isLoading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages: Flow<String> = _messages.receiveAsFlow()

    val activeWatches: List<PriceWatch>
        get() = watches.filter { it.status == PriceWatchStatus.ACTIVE }

    val triggeredWatches: List<PriceWatch>
        get() = watches.filter { it.status == PriceWatchStatus.TRIGGERED }

    private var loadJob: Job? = null

    init {
        load(isRefresh = false)
    }

    private fun load(isRefresh: Boolean) {
        loadJob?.cancel()
        isLoading = true
        if (!isRefresh) error = null
        loadJob = viewModelScope.launch {
            when (val result = repository.getWatches()) {
                is NetworkResult.Success -> {
                    watches = result.data
                    isLoading = false
                    error = null
                    if (isRefresh) _messages.send(stringProvider.get(R.string.pricetracking_updated_message))
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Watches load failed: ${result.error}")
                    isLoading = false
                    // Full error state only on an empty screen; otherwise keep the list + toast.
                    if (watches.isEmpty()) {
                        error = priceTrackingErrorMessages.toUserMessage(result.error)
                    } else {
                        _messages.send(priceTrackingErrorMessages.toUserMessage(result.error))
                    }
                }
            }
        }
    }

    fun retry() = load(isRefresh = false)

    fun onRefresh() = load(isRefresh = true)

    /** Optimistically removes the watch, reverting (and toasting) if the cancel fails. */
    fun onDelete(id: String) {
        val previous = watches
        watches = watches.filterNot { it.id == id }
        viewModelScope.launch {
            val result = repository.deleteWatch(id)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Delete watch failed: ${result.error}")
                watches = previous
                _messages.send(stringProvider.get(R.string.pricetracking_delete_failed_message))
            }
        }
    }

    private companion object {
        const val TAG = "PriceTrackingViewModel"
    }
}
