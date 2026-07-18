package com.tappyai.app.reviews.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewFeedType
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
import kotlin.math.round
import kotlin.math.roundToInt
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
    /** Active feed tab — For You (default) / Following / Latest, mirroring the web. */
    val feedType: ReviewFeedType = ReviewFeedType.ForYou,
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

    /** Switches the active feed tab and reloads from page 0. Mirrors the web, which aborts the
     *  in-flight request and refetches on tab change; clearing [ReviewsFeedUiState.reviews] makes
     *  the loading overlay show for the newly-selected tab rather than the old tab's posts. */
    fun onFeedTypeChange(type: ReviewFeedType) {
        if (_uiState.value.feedType == type) return
        _uiState.update { it.copy(feedType = type, reviews = emptyList()) }
        loadFirstPage()
    }

    private fun loadFirstPage() {
        loadJob?.cancel()
        page = 0
        val type = _uiState.value.feedType
        _uiState.update { it.copy(isInitialLoading = true, error = null, endReached = false) }
        loadJob = viewModelScope.launch {
            when (val result = repository.getFeed(page = 0, limit = PAGE_SIZE, sort = sortFor(type), following = followingFor(type))) {
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
        val type = _uiState.value.feedType
        _uiState.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            when (val result = repository.getFeed(page = page + 1, limit = PAGE_SIZE, sort = sortFor(type), following = followingFor(type))) {
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

    // Exact sort/following params the web sends per tab: For You → trending ranking; Following →
    // followed-authors, latest order; Latest → plain reverse-chronological.
    private fun sortFor(type: ReviewFeedType): String = when (type) {
        ReviewFeedType.ForYou -> "trending"
        ReviewFeedType.Latest -> "latest"
        ReviewFeedType.Following -> "latest"
    }

    private fun followingFor(type: ReviewFeedType): Boolean = type == ReviewFeedType.Following

    // ── Video watch analytics (feed-only, mirrors the web's behaviorTracker) ──────────
    private var activeVideoReviewId: String? = null
    private var activeStartMs: Long = 0L
    private val videoDurations = mutableMapOf<String, Float>()

    /** Records a clip's duration (seconds), reported by the player at READY — used to compute the
     *  completion_rate when the watch is finalized. */
    fun onVideoDuration(reviewId: String, durationSec: Float) {
        if (durationSec > 0f) videoDurations[reviewId] = durationSec
    }

    /**
     * Called when the settled feed page changes (or the first page loads). Finalizes the previously
     * active clip's watch, then starts timing [review] if it's a playable upload/link video. The
     * pager's settled page is the Android equivalent of the web tracker's ≥50%-visible clip.
     */
    fun onActiveReviewChanged(review: Review?) {
        finalizeActiveWatch()
        if (review != null && review.contentType == ReviewContentType.Video && review.mediaUrl != null) {
            activeVideoReviewId = review.id
            activeStartMs = System.currentTimeMillis()
        }
    }

    /** Finalizes any in-progress watch (e.g. when the feed leaves composition). */
    fun flushWatch() = finalizeActiveWatch()

    private fun finalizeActiveWatch() {
        val reviewId = activeVideoReviewId ?: return
        activeVideoReviewId = null
        val watchedSec = (System.currentTimeMillis() - activeStartMs) / 1000.0
        if (watchedSec < MIN_WATCH_SECONDS) return
        val duration = videoDurations[reviewId]
        val completion = if (duration != null && duration > 0f) minOf(watchedSec / duration, 1.0) else 0.0
        val watchSeconds = watchedSec.roundToInt()
        val completionRate = round(completion * 100) / 100
        viewModelScope.launch {
            // Fire-and-forget — a failure never affects playback (matches the web's sendBeacon).
            repository.recordInteraction(reviewId, watchSeconds, completionRate)
        }
    }

    private companion object {
        const val TAG = "ReviewsFeedViewModel"
        const val PAGE_SIZE = 12
        const val PREFETCH_DISTANCE = 3
        const val MIN_WATCH_SECONDS = 3.0
    }
}
