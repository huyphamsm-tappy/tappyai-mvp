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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for a single review's detail page. [review] comes from the repository's in-memory cache
 * (populated when the feed/search/profile served it) since the backend has no single-review GET;
 * a null review after load means a cache miss and the screen shows an empty state. Comments load
 * from the backend.
 */
data class ReviewDetailUiState(
    val review: Review? = null,
    val comments: List<ReviewComment> = emptyList(),
    val isLoadingComments: Boolean = false,
    val commentsError: String? = null,
)

@HiltViewModel
class ReviewDetailViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewDetailUiState())
    val uiState: StateFlow<ReviewDetailUiState> = _uiState.asStateFlow()

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

    private companion object {
        const val TAG = "ReviewDetailViewModel"
    }
}
