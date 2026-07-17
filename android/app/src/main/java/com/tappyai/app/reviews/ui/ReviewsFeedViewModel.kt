package com.tappyai.app.reviews.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewErrorMessages
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
 * State for the vertical reviews feed. [reviews] is the accumulated, paginated list the pager
 * renders; the boolean flags drive the loading / empty / error overlays the screen shows around
 * the pager.
 */
data class ReviewsFeedUiState(
    val reviews: List<Review> = emptyList(),
    val isInitialLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val endReached: Boolean = false,
)

@HiltViewModel
class ReviewsFeedViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewsFeedUiState())
    val uiState: StateFlow<ReviewsFeedUiState> = _uiState.asStateFlow()

    private var page = 0
    private var loadJob: Job? = null

    init {
        loadFirstPage()
    }

    /** (Re)load from page 0, replacing the list. Used for initial load, retry, and refresh. */
    fun refresh() = loadFirstPage()

    private fun loadFirstPage() {
        loadJob?.cancel()
        page = 0
        _uiState.update { it.copy(isInitialLoading = true, error = null, endReached = false) }
        loadJob = viewModelScope.launch {
            when (val result = repository.getFeed(page = 0, limit = PAGE_SIZE)) {
                is NetworkResult.Success -> _uiState.update {
                    it.copy(
                        reviews = result.data,
                        isInitialLoading = false,
                        error = null,
                        endReached = result.data.size < PAGE_SIZE,
                    )
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Feed load failed: ${result.error}")
                    _uiState.update {
                        it.copy(isInitialLoading = false, error = reviewErrorMessages.toUserMessage(result.error))
                    }
                }
            }
        }
    }

    /**
     * Called by the pager as the user approaches the end of the loaded list. Loads and appends the
     * next page. Guarded so overlapping settles, an in-flight load, or a reached end are no-ops.
     */
    fun onPageSettled(index: Int) {
        val state = _uiState.value
        if (state.isInitialLoading || state.isLoadingMore || state.endReached) return
        if (index < state.reviews.size - PREFETCH_DISTANCE) return
        loadNextPage()
    }

    private fun loadNextPage() {
        _uiState.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            when (val result = repository.getFeed(page = page + 1, limit = PAGE_SIZE)) {
                is NetworkResult.Success -> {
                    page += 1
                    // De-dupe by id: the feed has no cursor, so a row inserted between page
                    // requests can shift the window and repeat an item — a duplicate key would
                    // crash the pager's keyed items.
                    val existingIds = _uiState.value.reviews.mapTo(HashSet()) { it.id }
                    val fresh = result.data.filter { it.id !in existingIds }
                    _uiState.update {
                        it.copy(
                            reviews = it.reviews + fresh,
                            isLoadingMore = false,
                            endReached = result.data.size < PAGE_SIZE,
                        )
                    }
                }
                is NetworkResult.Error -> {
                    // Keep what's already shown; just stop the spinner. Next settle retries.
                    logger.e(TAG, "Feed page ${page + 1} failed: ${result.error}")
                    _uiState.update { it.copy(isLoadingMore = false) }
                }
            }
        }
    }

    /** Optimistically flips like state + count, reverting if the backend call fails. */
    fun toggleLike(review: Review) {
        val target = !review.likedByMe
        updateReview(review.id) {
            it.copy(likedByMe = target, likeCount = (it.likeCount + if (target) 1 else -1).coerceAtLeast(0))
        }
        viewModelScope.launch {
            val result = repository.toggleLike(review.id)
            if (result is NetworkResult.Error) {
                updateReview(review.id) {
                    it.copy(likedByMe = review.likedByMe, likeCount = review.likeCount)
                }
            } else if (result is NetworkResult.Success) {
                // Reconcile with the server's authoritative state.
                updateReview(review.id) { it.copy(likedByMe = result.data) }
            }
        }
    }

    /** Optimistically flips save state + count, reverting if the backend call fails. */
    fun toggleSave(review: Review) {
        val target = !review.savedByMe
        updateReview(review.id) {
            it.copy(savedByMe = target, saveCount = ((it.saveCount ?: 0) + if (target) 1 else -1).coerceAtLeast(0))
        }
        viewModelScope.launch {
            val result = repository.toggleSave(review.id)
            if (result is NetworkResult.Error) {
                updateReview(review.id) {
                    it.copy(savedByMe = review.savedByMe, saveCount = review.saveCount)
                }
            } else if (result is NetworkResult.Success) {
                updateReview(review.id) { it.copy(savedByMe = result.data) }
            }
        }
    }

    private inline fun updateReview(id: String, crossinline transform: (Review) -> Review) {
        _uiState.update { state ->
            state.copy(reviews = state.reviews.map { if (it.id == id) transform(it) else it })
        }
    }

    private companion object {
        const val TAG = "ReviewsFeedViewModel"
        const val PAGE_SIZE = 12
        const val PREFETCH_DISTANCE = 3
    }
}
