package com.tappyai.app.reviews.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewComment
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewsRepository
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
)

@HiltViewModel
class ReviewDetailViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewDetailUiState())
    val uiState: StateFlow<ReviewDetailUiState> = _uiState.asStateFlow()

    private val _events = Channel<DetailEvent>(Channel.BUFFERED)
    val events: Flow<DetailEvent> = _events.receiveAsFlow()

    private var loadedReviewId: String? = null

    /** Idempotent per review id — safe to call on every recomposition of the detail screen. */
    fun load(reviewId: String) {
        if (loadedReviewId == reviewId) return
        loadedReviewId = reviewId

        _uiState.update {
            it.copy(review = repository.getCachedReview(reviewId), isLoadingComments = true, commentsError = null)
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
        _uiState.update { it.copy(isPostingComment = true) }
        viewModelScope.launch {
            when (val result = repository.postComment(reviewId, trimmed)) {
                is NetworkResult.Success -> _uiState.update {
                    it.copy(comments = it.comments + result.data, isPostingComment = false)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Post comment failed: ${result.error}")
                    _uiState.update { it.copy(isPostingComment = false) }
                    _events.send(DetailEvent.CommentFailed(reviewErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    private companion object {
        const val TAG = "ReviewDetailViewModel"
    }
}
