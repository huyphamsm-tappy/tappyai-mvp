package com.tappyai.app.reviews.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewFeedType
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.features.auth.data.AuthRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
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
    // The signed-in user's id (JWT `sub`) so the feed can show the own-post overflow (delete/hide)
    // on the user's OWN posts only, mirroring the web feed. Null when signed out.
    val currentUserId: String? = null,
)

/**
 * Where the pager's rows come from. [Explore] is the discovery feed (the tabs' sort/following);
 * [Profile] is one profile's clips — the signed-in user's own posts when [Profile.userId] is null,
 * otherwise that author's — the same calls the profile grids make, so the pager pages exactly the
 * grid, in the grid's order, and never a discovery row.
 */
sealed interface ReviewsFeedSource {
    data object Explore : ReviewsFeedSource
    data class Profile(val userId: String?) : ReviewsFeedSource
    /**
     * The signed-in user's saved reviews — the self profile's "Đã lưu" grid, in its order (newest
     * save first). Self-only by the route's construction (`GET /api/reviews/saved` keys on the
     * bearer); one unpaged call, each reduced row hydrated through `GET /api/reviews/{id}`.
     */
    data object Saved : ReviewsFeedSource
}

@HiltViewModel
class ReviewsFeedViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val authRepository: AuthRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    // The Feed destination has no arguments; ProfileClips carries the profile. Read once.
    val source: ReviewsFeedSource = sourceFrom(savedStateHandle)

    private val _uiState = MutableStateFlow(ReviewsFeedUiState(currentUserId = authRepository.currentUserId()))
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
            when (val result = loadPage(0, type)) {
                is NetworkResult.Success -> _uiState.update {
                    it.copy(
                        reviews = result.data,
                        isInitialLoading = false,
                        error = null,
                        // A profile's own-posts list and the saved list are one unpaged call each;
                        // the others page by size.
                        endReached = source.isMine || result.data.size < PAGE_SIZE,
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
            when (val result = loadPage(page + 1, type)) {
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

    /**
     * Deletes the caller's own post (web parity: own-post overflow → Delete). Optimistically removes
     * it from the feed; a failure re-adds the prior list. Server enforces ownership independently.
     */
    fun deleteReview(review: Review) {
        val previous = _uiState.value.reviews
        _uiState.update { it.copy(reviews = it.reviews.filterNot { r -> r.id == review.id }) }
        viewModelScope.launch {
            val result = repository.deleteReview(review.id)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Delete review failed: ${result.error}")
                _uiState.update { it.copy(reviews = previous) }
            }
        }
    }

    /** Hides the caller's own post (web parity: own-post overflow → Hide). Same optimistic-remove +
     *  revert-on-failure as [deleteReview], but via setHidden rather than a hard delete. */
    fun hideReview(review: Review) {
        val previous = _uiState.value.reviews
        _uiState.update { it.copy(reviews = it.reviews.filterNot { r -> r.id == review.id }) }
        viewModelScope.launch {
            val result = repository.setHidden(review.id, true)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Hide review failed: ${result.error}")
                _uiState.update { it.copy(reviews = previous) }
            }
        }
    }

    /**
     * Follows / unfollows the AUTHOR of [review] without leaving the clip — the rail's "+" badge.
     * The same `POST /api/users/{id}/follow` toggle the profile screen uses (server flips the
     * row and returns `following`). Optimistic: every loaded row by that author flips at once,
     * the server's answer is written back, a failure reverts. A no-op for the viewer's own posts
     * (the server refuses `follow_self` anyway) and while a toggle for that author is in flight.
     */
    fun toggleFollow(review: Review) {
        val authorId = review.userId
        if (authorId == _uiState.value.currentUserId || authorId in followInFlight) return
        val target = !review.isFollowingAuthor
        followInFlight += authorId
        _uiState.update { s -> s.copy(reviews = s.reviews.withFollowState(authorId, target)) }
        viewModelScope.launch {
            when (val result = repository.toggleFollow(authorId)) {
                is NetworkResult.Success ->
                    _uiState.update { s -> s.copy(reviews = s.reviews.withFollowState(authorId, result.data)) }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Follow toggle failed: ${result.error}")
                    _uiState.update { s -> s.copy(reviews = s.reviews.withFollowState(authorId, !target)) }
                }
            }
            followInFlight -= authorId
        }
    }

    private val followInFlight = mutableSetOf<String>()

    /**
     * The comment sheet's result: the server's comment count for ONE review, written into the feed
     * row so the rail shows it after the sheet closes (web: `addComment` in reviews/page.tsx). Only
     * that row changes; nothing is reloaded.
     */
    fun setCommentCount(reviewId: String, count: Int) {
        _uiState.update { state -> state.copy(reviews = state.reviews.withCommentCount(reviewId, count)) }
    }

    private inline fun updateReview(id: String, crossinline transform: (Review) -> Review) {
        _uiState.update { state ->
            state.copy(reviews = state.reviews.map { if (it.id == id) transform(it) else it })
        }
    }

    /**
     * One page of rows for [source]. Explore: the discovery feed with the tab's sort/following.
     * Profile: the grid's own call — `getMine()` for the signed-in user (unpaged, hidden/held posts
     * included, exactly what the Self Profile grid shows) or `getFeed(userId=…, latest)` for an
     * author (what the Author Profile grid shows). A profile source never touches the discovery
     * feed, so the pager cannot pick up another author's clip.
     */
    private suspend fun loadPage(pageIndex: Int, type: ReviewFeedType): NetworkResult<List<Review>> = when (val s = source) {
        ReviewsFeedSource.Explore ->
            repository.getFeed(page = pageIndex, limit = PAGE_SIZE, sort = sortFor(type), following = followingFor(type))
        is ReviewsFeedSource.Profile -> when (val userId = s.userId) {
            null -> if (pageIndex == 0) repository.getMine() else NetworkResult.Success(emptyList())
            else -> repository.getFeed(page = pageIndex, limit = PAGE_SIZE, sort = "latest", userId = userId)
        }
        ReviewsFeedSource.Saved -> if (pageIndex == 0) loadSaved() else NetworkResult.Success(emptyList())
    }

    /** The viewer's own unpaged lists — own posts (`/mine`) and saved (`/saved`): one call, no page 2. */
    private val ReviewsFeedSource.isMine: Boolean
        get() = (this is ReviewsFeedSource.Profile && userId == null) || this is ReviewsFeedSource.Saved

    /**
     * The saved list, playable: `GET /api/reviews/saved` answers reduced rows (tile fields only —
     * no author, media or counts), so each is fetched in full through the existing
     * `GET /api/reviews/{id}`, a few at a time, keeping the saved order. A row the server no
     * longer serves (hidden or deleted since it was saved → 404) is dropped rather than shown
     * empty; only when every row fails does the pager report the failure.
     */
    private suspend fun loadSaved(): NetworkResult<List<Review>> {
        val saved = repository.getSaved()
        if (saved !is NetworkResult.Success || saved.data.isEmpty()) return saved
        val limit = Semaphore(HYDRATE_CONCURRENCY)
        val full = coroutineScope {
            saved.data.map { row -> async { limit.withPermit { repository.getReview(row.id) } } }.awaitAll()
        }
        val rows = full.mapNotNull { (it as? NetworkResult.Success)?.data }
        if (rows.isEmpty()) full.firstOrNull { it is NetworkResult.Error }?.let { return it as NetworkResult.Error }
        return NetworkResult.Success(rows)
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
        /** Saved rows hydrated in parallel, at most this many requests in flight. */
        const val HYDRATE_CONCURRENCY = 4
        const val PREFETCH_DISTANCE = 3
        const val MIN_WATCH_SECONDS = 3.0
    }
}

/**
 * The pager's source from the destination's arguments: `ReviewsRoute.ProfileClips` carries
 * `startReviewId` (+ nullable `userId`, + `saved`); the Feed destination carries nothing → Explore.
 */
internal fun sourceFrom(savedStateHandle: SavedStateHandle): ReviewsFeedSource =
    if (savedStateHandle.contains("startReviewId")) {
        val route = savedStateHandle.toRoute<ReviewsRoute.ProfileClips>()
        if (route.saved) ReviewsFeedSource.Saved else ReviewsFeedSource.Profile(userId = route.userId)
    } else {
        ReviewsFeedSource.Explore
    }

/** The pager page a profile opens on: the tapped clip's row, or the first row when it is gone. */
internal fun initialPageFor(reviews: List<Review>, startReviewId: String): Int =
    reviews.indexOfFirst { it.id == startReviewId }.coerceAtLeast(0)

/** [toggleFollow]'s row transform: every row by [authorId] gets [following]; other rows are the same object. */
internal fun List<Review>.withFollowState(authorId: String, following: Boolean): List<Review> =
    map { if (it.userId == authorId && it.isFollowingAuthor != following) it.copy(isFollowingAuthor = following) else it }

/** [setCommentCount]'s row transform: the row with [reviewId] gets [count]; every other row is the same object. */
internal fun List<Review>.withCommentCount(reviewId: String, count: Int): List<Review> =
    map { if (it.id == reviewId && it.commentCount != count) it.copy(commentCount = count) else it }
