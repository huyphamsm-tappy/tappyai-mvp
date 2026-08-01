package com.tappyai.app.reviews.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewComment
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
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
 * State for a single review's detail page. [review] comes from the repository's in-memory cache
 * (populated when the feed/search/profile served it) since the backend has no single-review GET;
 * a null review after load means a cache miss and the screen shows an empty state. Comments load
 * from the backend. [currentUserId] drives the own-post overflow menu, matching the web's
 * `isMe = me === r.user_id` (`src/app/reviews/page.tsx:254`).
 */
data class ReviewDetailUiState(
    val review: Review? = null,
    val comments: List<ReviewComment> = emptyList(),
    val isLoadingComments: Boolean = false,
    val commentsError: String? = null,
    val currentUserId: String? = null,
    val commentInput: String = "",
    val isPostingComment: Boolean = false,
    /** The comment being replied to, or null for a top-level comment (web `replyTo`). */
    val replyingTo: ReviewComment? = null,
) {
    /** Mirrors the web composer's send-enabled rule: non-blank, within the 1–300 char cap. */
    val canPostComment: Boolean
        get() = commentInput.trim().let { it.isNotEmpty() && it.length <= MAX_COMMENT_LENGTH } && !isPostingComment
}

const val MAX_COMMENT_LENGTH = 300

/** Delete/hide are terminal for this screen — the reviewed row no longer exists, so the screen
 *  navigates back on success rather than trying to show an empty detail view. */
sealed interface ReviewDetailEvent {
    data object Removed : ReviewDetailEvent
    data class Error(val message: String) : ReviewDetailEvent
}

@HiltViewModel
class ReviewDetailViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
    private val authRepository: AuthRepository,
    private val attachedSoundResolver: com.tappyai.app.reviews.data.AttachedSoundResolver,
) : ViewModel() {

    /** Resolves a borrowed track's audio URL for "use this sound" playback (web parity). */
    suspend fun resolveAttachedSoundUrl(trackId: String): String? = attachedSoundResolver.soundUrl(trackId)

    private val _uiState = MutableStateFlow(ReviewDetailUiState())
    val uiState: StateFlow<ReviewDetailUiState> = _uiState.asStateFlow()

    private val _events = Channel<ReviewDetailEvent>(Channel.BUFFERED)
    val events: Flow<ReviewDetailEvent> = _events.receiveAsFlow()

    private var loadedReviewId: String? = null

    init {
        viewModelScope.launch {
            val userId = withContext(Dispatchers.IO) { authRepository.currentUserId() }
            _uiState.update { it.copy(currentUserId = userId) }
        }
    }

    /** Idempotent per review id — safe to call on every recomposition of the detail screen. */
    fun load(reviewId: String) {
        if (loadedReviewId == reviewId) return
        loadedReviewId = reviewId

        _uiState.update {
            it.copy(review = repository.getCachedReview(reviewId), isLoadingComments = true, commentsError = null)
        }
        viewModelScope.launch {
            // Cache-miss fallback. The review cache is only populated by whatever feed the user
            // scrolled, so a COLD entry into this screen — tapping a notification ("X liked your
            // review") — used to find nothing and render "This post is no longer available", a dead
            // end on a real, existing post. There is no GET /api/reviews/{id} endpoint (405), so
            // recover via getMine(), which fetches the caller's own reviews and fills the same
            // cache. Notification targets are by definition the caller's OWN posts, which are also
            // exactly the ones the discovery feed excludes — so this covers the failing case.
            if (repository.getCachedReview(reviewId) == null) {
                repository.getMine()
                repository.getCachedReview(reviewId)?.let { fetched ->
                    _uiState.update { it.copy(review = fetched) }
                }
            }
            when (val result = repository.getComments(reviewId)) {
                is NetworkResult.Success -> _uiState.update {
                    it.copy(comments = result.data, isLoadingComments = false, commentsError = null)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Comments load failed: ${result.error}")
                    _uiState.update {
                        it.copy(isLoadingComments = false, commentsError = reviewErrorMessages.toUserMessage(result.error))
                    }
                }
            }
        }
    }

    /** Silent re-fetch used to reconcile after a failed optimistic reaction (web's `loadComments()`
     *  reconcile). Unlike [load] it isn't id-guarded, so it always refreshes the current list. */
    private fun reloadComments() {
        val reviewId = loadedReviewId ?: return
        viewModelScope.launch {
            when (val result = repository.getComments(reviewId)) {
                is NetworkResult.Success -> _uiState.update { it.copy(comments = result.data) }
                is NetworkResult.Error -> logger.e(TAG, "Comments reload failed: ${result.error}")
            }
        }
    }

    fun onCommentInputChange(value: String) {
        // Hard-cap the field at the backend limit so the user can't type past what will be accepted.
        _uiState.update { it.copy(commentInput = value.take(MAX_COMMENT_LENGTH)) }
    }

    /** Begins a reply to [comment]; the composer shows a "replying to" banner until posted/cancelled. */
    fun startReply(comment: ReviewComment) {
        _uiState.update { it.copy(replyingTo = comment) }
    }

    fun cancelReply() {
        _uiState.update { it.copy(replyingTo = null) }
    }

    /**
     * Adds, switches, or removes the caller's reaction on a comment — optimistic, one reaction per
     * user (re-tapping the same key removes it), mirroring the web `react()`. On failure it re-fetches
     * to reconcile rather than guessing the server state.
     */
    fun reactToComment(commentId: String, key: String) {
        val target = _uiState.value.comments.firstOrNull { it.id == commentId } ?: return
        val removing = target.myReaction == key
        _uiState.update { s ->
            s.copy(comments = s.comments.map { c ->
                if (c.id != commentId) return@map c
                val counts = c.reactions.toMutableMap()
                c.myReaction?.let { prev ->
                    val next = (counts[prev] ?: 0) - 1
                    if (next > 0) counts[prev] = next else counts.remove(prev)
                }
                if (!removing) counts[key] = (counts[key] ?: 0) + 1
                c.copy(reactions = counts, myReaction = if (removing) null else key)
            })
        }
        viewModelScope.launch {
            val result = if (removing) {
                repository.removeCommentReaction(commentId)
            } else {
                repository.reactToComment(commentId, key)
            }
            if (result is NetworkResult.Error) {
                logger.e(TAG, "React to comment failed: ${result.error}")
                reloadComments()
            }
        }
    }

    /** Posts the current input. On success appends the returned comment and syncs the exact count
     *  (also updating the review card's count); on failure surfaces an error and keeps the input. */
    fun postComment() {
        val reviewId = loadedReviewId ?: return
        val state = _uiState.value
        if (!state.canPostComment) return
        val body = state.commentInput.trim()
        // One-level nesting is a client rule (web parity): a reply to a reply re-parents to the
        // thread root, so use the target's own parent id when it has one.
        val parentId = state.replyingTo?.let { it.parentCommentId ?: it.id }
        _uiState.update { it.copy(isPostingComment = true) }
        viewModelScope.launch {
            when (val result = repository.postComment(reviewId, body, parentId)) {
                is NetworkResult.Success -> _uiState.update { s ->
                    val appended = result.data.comment?.let { s.comments + it } ?: s.comments
                    s.copy(
                        comments = appended,
                        commentInput = "",
                        isPostingComment = false,
                        replyingTo = null,
                        review = s.review?.copy(commentCount = result.data.count),
                    )
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Post comment failed: ${result.error}")
                    _uiState.update { it.copy(isPostingComment = false) }
                    _events.send(ReviewDetailEvent.Error(reviewErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    /** Deletes one of the caller's own comments (optimistic removal; reverts + toasts on failure).
     *  Deleting a parent also drops its replies locally, mirroring the DB cascade. */
    fun deleteComment(commentId: String) {
        val reviewId = loadedReviewId ?: return
        val snapshot = _uiState.value.comments
        val removedCount = snapshot.count { it.id == commentId || it.parentCommentId == commentId }
        _uiState.update { s ->
            s.copy(
                comments = s.comments.filterNot { it.id == commentId || it.parentCommentId == commentId },
                review = s.review?.let { it.copy(commentCount = (it.commentCount - removedCount).coerceAtLeast(0)) },
            )
        }
        viewModelScope.launch {
            when (val result = repository.deleteComment(reviewId, commentId)) {
                is NetworkResult.Success -> _uiState.update { s ->
                    s.copy(review = s.review?.copy(commentCount = result.data))
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Delete comment failed: ${result.error}")
                    _uiState.update { it.copy(comments = snapshot) }
                    _events.send(ReviewDetailEvent.Error(reviewErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    fun toggleLike() {
        val review = _uiState.value.review ?: return
        val target = !review.likedByMe
        _uiState.update {
            it.copy(review = review.copy(likedByMe = target, likeCount = (review.likeCount + if (target) 1 else -1).coerceAtLeast(0)))
        }
        viewModelScope.launch {
            val result = repository.toggleLike(review.id)
            if (result is NetworkResult.Error) {
                _uiState.update { it.copy(review = review) }
            } else if (result is NetworkResult.Success) {
                _uiState.update { s -> s.review?.let { s.copy(review = it.copy(likedByMe = result.data)) } ?: s }
            }
        }
    }

    fun toggleSave() {
        val review = _uiState.value.review ?: return
        val target = !review.savedByMe
        _uiState.update {
            it.copy(review = review.copy(savedByMe = target, saveCount = ((review.saveCount ?: 0) + if (target) 1 else -1).coerceAtLeast(0)))
        }
        viewModelScope.launch {
            val result = repository.toggleSave(review.id)
            if (result is NetworkResult.Error) {
                _uiState.update { it.copy(review = review) }
            } else if (result is NetworkResult.Success) {
                _uiState.update { s -> s.review?.let { s.copy(review = it.copy(savedByMe = result.data)) } ?: s }
            }
        }
    }

    /** Deletes the currently-loaded review; navigates back on success (see [ReviewDetailEvent]). */
    fun delete() {
        val review = _uiState.value.review ?: return
        viewModelScope.launch {
            val result = repository.deleteReview(review.id)
            _events.send(
                if (result is NetworkResult.Error) {
                    logger.e(TAG, "Delete review failed: ${result.error}")
                    ReviewDetailEvent.Error(reviewErrorMessages.toUserMessage(result.error))
                } else {
                    ReviewDetailEvent.Removed
                },
            )
        }
    }

    /** Hides the currently-loaded review; navigates back on success — matches the web's hide
     *  action, which also drops the row out of the viewer's own view (see [ReviewDetailEvent]). */
    fun hide() {
        val review = _uiState.value.review ?: return
        viewModelScope.launch {
            val result = repository.setHidden(review.id, true)
            _events.send(
                if (result is NetworkResult.Error) {
                    logger.e(TAG, "Hide review failed: ${result.error}")
                    ReviewDetailEvent.Error(reviewErrorMessages.toUserMessage(result.error))
                } else {
                    ReviewDetailEvent.Removed
                },
            )
        }
    }

    private companion object {
        const val TAG = "ReviewDetailViewModel"
    }
}
