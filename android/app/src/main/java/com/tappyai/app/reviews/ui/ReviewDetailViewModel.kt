package com.tappyai.app.reviews.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewComment
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.music.MusicTrack
import com.tappyai.app.music.data.MusicRepository
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.features.auth.data.AuthRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for a single review's detail page. [review] comes from the repository's in-memory cache
 * (populated when the feed/search/profile served it) since the backend has no single-review GET;
 * a null review after load means a cache miss and the screen shows an empty state. Comments load
 * from the backend.
 */
/** One-shot detail-screen events (e.g. a failed comment post → Toast). */
sealed interface DetailEvent {
    data class CommentFailed(val message: String) : DetailEvent
}

data class ReviewDetailUiState(
    val review: Review? = null,
    val comments: List<ReviewComment> = emptyList(),
    val isLoadingComments: Boolean = false,
    val commentsError: String? = null,
    val isPostingComment: Boolean = false,
    // The signed-in user's id (JWT `sub`), so the comment list can show a delete affordance on the
    // user's OWN comments only — mirrors the web's own-comment trash button. Null when signed out.
    val currentUserId: String? = null,
    // The comment currently being replied to (composer shows a "Replying to …" chip), or null for a
    // top-level comment. Mirrors the web CommentDrawer's reply target.
    val replyingTo: ReviewComment? = null,
    // Metadata for the review's attached background track, once resolved — backs the attached-music
    // card (web ReviewMusicCard, which fetches the track via useMusicTrack). Null when the review
    // has no music or the lookup failed (the card then simply doesn't render).
    val attachedTrack: MusicTrack? = null,
)

@HiltViewModel
class ReviewDetailViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val authRepository: AuthRepository,
    private val musicRepository: MusicRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewDetailUiState(currentUserId = authRepository.currentUserId()))
    val uiState: StateFlow<ReviewDetailUiState> = _uiState.asStateFlow()

    private val _events = Channel<DetailEvent>(Channel.BUFFERED)
    val events: Flow<DetailEvent> = _events.receiveAsFlow()

    private var loadedReviewId: String? = null

    /** Idempotent per review id — safe to call on every recomposition of the detail screen. */
    fun load(reviewId: String) {
        if (loadedReviewId == reviewId) return
        loadedReviewId = reviewId

        val cached = repository.getCachedReview(reviewId)
        _uiState.update {
            it.copy(review = cached, isLoadingComments = true, commentsError = null)
        }
        // Resolve the attached track's metadata for the attached-music card (best-effort: a failure
        // just leaves the card unrendered, mirroring the web's silent useMusicTrack error path).
        cached?.music?.trackId?.takeIf { it.isNotBlank() }?.let { trackId ->
            viewModelScope.launch {
                when (val result = musicRepository.getSoundDetail(trackId)) {
                    is NetworkResult.Success -> _uiState.update { it.copy(attachedTrack = result.data.track) }
                    is NetworkResult.Error -> logger.e(TAG, "Attached track load failed: ${result.error}")
                }
            }
        }
        viewModelScope.launch {
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

    /**
     * Posts [text] as a comment on the loaded review. On success the server-created comment (with
     * its real id/author/timestamp) is appended so it shows immediately; a failure (validation,
     * rate-limit, network) surfaces as a one-shot [DetailEvent.CommentFailed] for a Toast. Ignores
     * blank text, a re-entrant call while posting, and the pre-load state (no review id yet).
     */
    fun postComment(text: String) {
        val trimmed = text.trim()
        val reviewId = loadedReviewId
        if (trimmed.isEmpty() || reviewId == null || _uiState.value.isPostingComment) return
        // One-level threading (web parity): replying to a reply folds into the same top-level thread
        // (its parent), so a reply's parent is its ancestor, never the reply itself.
        val parentId = _uiState.value.replyingTo?.let { it.parentCommentId ?: it.id }
        _uiState.update { it.copy(isPostingComment = true) }
        viewModelScope.launch {
            when (val result = repository.postComment(reviewId, trimmed, parentId)) {
                is NetworkResult.Success -> _uiState.update {
                    it.copy(comments = it.comments + result.data, isPostingComment = false, replyingTo = null)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Post comment failed: ${result.error}")
                    _uiState.update { it.copy(isPostingComment = false) }
                    _events.send(DetailEvent.CommentFailed(reviewErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    /** Enters reply mode targeting [comment] (top-level only; a reply's own replies fold under it). */
    fun startReply(comment: ReviewComment) = _uiState.update { it.copy(replyingTo = comment) }

    /** Leaves reply mode — the next posted comment is top-level again. */
    fun cancelReply() = _uiState.update { it.copy(replyingTo = null) }

    /**
     * Sets, changes, or clears the caller's single reaction on [commentId]. Optimistically shifts the
     * user's one reaction (dropping any count that hits zero); on failure it reloads the comment list
     * to reconcile with the server. Tapping the already-selected [reactionKey] removes it. One
     * reaction per user per comment, mirroring the web CommentDrawer.
     */
    fun toggleReaction(commentId: String, reactionKey: String) {
        val reviewId = loadedReviewId ?: return
        val target = _uiState.value.comments.firstOrNull { it.id == commentId } ?: return
        val removing = target.myReaction == reactionKey
        _uiState.update { state ->
            state.copy(comments = state.comments.map { c ->
                if (c.id != commentId) return@map c
                val counts = c.reactions.toMutableMap()
                c.myReaction?.let { counts[it] = (counts[it] ?: 0) - 1 }
                if (!removing) counts[reactionKey] = (counts[reactionKey] ?: 0) + 1
                c.copy(
                    reactions = counts.filterValues { it > 0 },
                    myReaction = if (removing) null else reactionKey,
                )
            })
        }
        viewModelScope.launch {
            val result = if (removing) repository.removeReaction(commentId)
            else repository.setReaction(commentId, reactionKey)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Reaction failed: ${result.error}")
                // Reconcile with the server so the optimistic shift can't drift.
                when (val reload = repository.getComments(reviewId)) {
                    is NetworkResult.Success -> _uiState.update { it.copy(comments = reload.data) }
                    is NetworkResult.Error -> logger.e(TAG, "Reaction reload failed: ${reload.error}")
                }
            }
        }
    }

    /**
     * Deletes the caller's own comment ([commentId]). Optimistically removes it from the list, then
     * syncs the review's comment count to the server's real count on success; a failure reverts the
     * removal and surfaces a [DetailEvent.CommentFailed] toast. Mirrors the web's own-comment delete.
     */
    fun deleteComment(commentId: String) {
        val reviewId = loadedReviewId ?: return
        val previous = _uiState.value.comments
        _uiState.update { it.copy(comments = it.comments.filterNot { c -> c.id == commentId }) }
        viewModelScope.launch {
            when (val result = repository.deleteComment(reviewId, commentId)) {
                is NetworkResult.Success -> _uiState.update { s ->
                    s.copy(review = s.review?.copy(commentCount = result.data))
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Delete comment failed: ${result.error}")
                    _uiState.update { it.copy(comments = previous) }
                    _events.send(DetailEvent.CommentFailed(reviewErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    private companion object {
        const val TAG = "ReviewDetailViewModel"
    }
}
