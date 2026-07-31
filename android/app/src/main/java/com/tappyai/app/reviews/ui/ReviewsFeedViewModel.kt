package com.tappyai.app.reviews.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * State for the vertical reviews feed. [reviews] is the accumulated, paginated list the pager
 * renders; the boolean flags drive the loading / empty / error overlays the screen shows around
 * the pager. [currentUserId] drives each card's own-post affordances (matches the web's
 * `isMe = me === r.user_id`, `src/app/reviews/page.tsx:254`).
 */
/**
 * The three feed switcher options (web parity, `src/app/reviews/page.tsx` + `/api/reviews/feed`):
 * - [ForYou] → `sort=trending` (personalised ranking; the web also adds a city boost we omit since
 *   Android has no city source — the backend treats an empty city as no boost).
 * - [Following] → `sort=latest&following=true` (posts from followed authors; needs auth).
 * - [Latest] → `sort=latest` (chronological, the default backend sort).
 */
enum class FeedType(val sort: String, val following: Boolean) {
    ForYou("trending", false),
    Following("latest", true),
    Latest("latest", false),
}

data class ReviewsFeedUiState(
    val reviews: List<Review> = emptyList(),
    val isInitialLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val endReached: Boolean = false,
    val currentUserId: String? = null,
    /** Active feed tab. Default For You, matching the web's initial `feedType='for-you'`. */
    val feedType: FeedType = FeedType.ForYou,
    /** Unread notification count — drives the bell badge (web parity: unread indicator). */
    val unreadNotifications: Int = 0,
)

@HiltViewModel
class ReviewsFeedViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
    private val authRepository: AuthRepository,
    private val analytics: com.tappyai.core.analytics.AnalyticsProvider,
    private val attachedSoundResolver: com.tappyai.app.reviews.data.AttachedSoundResolver,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    /** Resolves a borrowed track's audio URL for in-feed "use this sound" playback (web parity). */
    suspend fun resolveAttachedSoundUrl(trackId: String): String? = attachedSoundResolver.soundUrl(trackId)

    // Restore the feed tab first, so the initial load fetches the tab the user last saw rather than
    // always defaulting to For You after process death (web-parity contract §5.3: persist feed type).
    private val initialFeedType: FeedType =
        savedStateHandle.get<String>(KEY_FEED_TYPE)
            ?.let { name -> runCatching { FeedType.valueOf(name) }.getOrNull() }
            ?: FeedType.ForYou

    private val _uiState = MutableStateFlow(ReviewsFeedUiState(feedType = initialFeedType))
    val uiState: StateFlow<ReviewsFeedUiState> = _uiState.asStateFlow()

    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages: Flow<String> = _messages.receiveAsFlow()

    private var page = 0
    private var loadJob: Job? = null
    private var pageJob: Job? = null

    init {
        loadFirstPage()
        viewModelScope.launch {
            val userId = withContext(Dispatchers.IO) { authRepository.currentUserId() }
            _uiState.update { it.copy(currentUserId = userId) }
        }
        refreshUnreadNotifications()
    }

    /** Load the unread notification count for the bell badge (web parity). Derived from the grouped
     *  notifications' read state; silently no-ops on failure (the badge just stays hidden). Call on
     *  init and whenever the feed is refreshed / returned to. */
    fun refreshUnreadNotifications() {
        viewModelScope.launch {
            val result = repository.getNotifications()
            if (result is NetworkResult.Success) {
                val unread = result.data.count { it.readAt == null }
                _uiState.update { it.copy(unreadNotifications = unread) }
            }
        }
    }

    /**
     * The clip the user was last on, persisted across process death. The feed screen restores the
     * pager to THIS id's current index (web-parity contract §5.3: restore by clip id, not index —
     * the trending feed re-orders between fetches, so a saved index points at the wrong clip).
     * Null when there's nothing to restore (fresh launch or after a tab switch).
     */
    val restoreClipId: String? get() = savedStateHandle[KEY_CLIP_ID]

    /** Records the settled clip so it can be restored later; called by the pager as pages settle. */
    fun onActiveClipChanged(clipId: String) {
        savedStateHandle[KEY_CLIP_ID] = clipId
    }

    /** (Re)load from page 0, replacing the list. Used for initial load, retry, and refresh. */
    fun refresh() = loadFirstPage()

    /** Switches the active feed tab and reloads from page 0. No-op if already on [type]. */
    fun onFeedTypeChange(type: FeedType) {
        if (_uiState.value.feedType == type) return
        // Persist the new tab and drop the saved clip: a different tab is a different, re-sorted
        // list, so the next entry restores to the top rather than to a stale clip id.
        savedStateHandle[KEY_FEED_TYPE] = type.name
        savedStateHandle[KEY_CLIP_ID] = null
        _uiState.update { it.copy(feedType = type, reviews = emptyList()) }
        loadFirstPage()
    }

    private fun loadFirstPage() {
        loadJob?.cancel()
        // Cancel any in-flight paging load too — otherwise a stale page-N append from the previous
        // feed tab would inject the wrong tab's reviews and desync the `page` cursor.
        pageJob?.cancel()
        page = 0
        val feedType = _uiState.value.feedType
        _uiState.update {
            it.copy(isInitialLoading = true, isLoadingMore = false, error = null, endReached = false)
        }
        loadJob = viewModelScope.launch {
            when (val result = repository.getFeed(page = 0, limit = PAGE_SIZE, sort = feedType.sort, following = feedType.following)) {
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
        val feedType = _uiState.value.feedType
        _uiState.update { it.copy(isLoadingMore = true) }
        pageJob = viewModelScope.launch {
            val result = repository.getFeed(page = page + 1, limit = PAGE_SIZE, sort = feedType.sort, following = feedType.following)
            // The tab may have switched while this page was in flight (loadFirstPage cancels this job,
            // but guard the result-application too in case the switch raced the network return).
            if (_uiState.value.feedType != feedType) return@launch
            when (result) {
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
        // Personalization signal (web parity, reviews/page.tsx:808) — best-effort telemetry.
        analytics.track("review_like", mapOf("review_id" to review.id, "place" to review.placeName, "liked" to target))
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
        // Personalization signal (web parity, reviews/page.tsx:855) — fired on save (matches web,
        // which only tracks the save direction).
        if (target) analytics.track("place_save", mapOf("review_id" to review.id))
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

    /**
     * Deletes an own post. Matches the web's `del(id)` (`src/app/reviews/page.tsx:1425`): the row
     * disappears from the feed immediately on success. Optimistic, reverting (and messaging) on
     * failure — same shape as [MyReviewsViewModel]'s `delete`.
     */
    fun delete(review: Review) {
        removeLocal(review.id)
        viewModelScope.launch {
            val result = repository.deleteReview(review.id)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Delete review failed: ${result.error}")
                reinsertLocal(review)
                _messages.send(reviewErrorMessages.toUserMessage(result.error))
            }
        }
    }

    /**
     * Hides an own post. Matches the web's hide action (`src/app/reviews/page.tsx:392`), which
     * also removes the row from the viewer's own feed on success rather than showing a "hidden"
     * badge in place — that badge only appears in My Reviews' self-scoped list.
     */
    fun hide(review: Review) {
        removeLocal(review.id)
        viewModelScope.launch {
            val result = repository.setHidden(review.id, true)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Hide review failed: ${result.error}")
                reinsertLocal(review)
                _messages.send(reviewErrorMessages.toUserMessage(result.error))
            }
        }
    }

    private fun removeLocal(id: String) {
        _uiState.update { it.copy(reviews = it.reviews.filterNot { r -> r.id == id }) }
    }

    /** Re-inserts at its original index relative to the CURRENT list, not a stale pre-removal
     *  snapshot — a concurrent page load may have changed the list in between. */
    private fun reinsertLocal(review: Review) {
        _uiState.update { state ->
            if (state.reviews.any { it.id == review.id }) return@update state
            state.copy(reviews = state.reviews.toMutableList().apply { add(0, review) })
        }
    }

    private companion object {
        const val TAG = "ReviewsFeedViewModel"
        const val PAGE_SIZE = 12
        const val PREFETCH_DISTANCE = 3
        const val KEY_CLIP_ID = "feed_active_clip_id"
        const val KEY_FEED_TYPE = "feed_type"
    }
}
