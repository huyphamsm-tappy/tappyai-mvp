package com.tappyai.app.reviews.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewGroupedNotification
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Activity feed from GET /api/notifications. The backend returns a flat list already rendered as
 * Vietnamese text; the repository groups it (grouping is unchanged client logic) into the
 * [ReviewGroupedNotification]s the list renders.
 */
data class ReviewNotificationsUiState(
    val notifications: List<ReviewGroupedNotification> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ReviewNotificationsViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewNotificationsUiState())
    val uiState: StateFlow<ReviewNotificationsUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun load() {
        loadJob?.cancel()
        _uiState.update { it.copy(isLoading = true, error = null) }
        loadJob = viewModelScope.launch {
            when (val result = repository.getNotifications()) {
                is NetworkResult.Success -> _uiState.update {
                    it.copy(notifications = result.data, isLoading = false, error = null)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Notifications load failed: ${result.error}")
                    _uiState.update { it.copy(isLoading = false, error = reviewErrorMessages.toUserMessage(result.error)) }
                }
            }
        }
    }

    private companion object {
        const val TAG = "ReviewNotificationsVM"
    }
}
