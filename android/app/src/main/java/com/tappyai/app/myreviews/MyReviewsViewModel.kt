package com.tappyai.app.myreviews

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.tappyai.app.reviews.data.Review as BackendReview

/**
 * Backs the My Reviews grid with `GET /api/reviews/mine` (own reviews, including hidden — the
 * public feed always excludes hidden rows, even for the owner, so this is a dedicated self-scoped
 * endpoint). Hide/show is optimistic (`PATCH /api/reviews/{id}`), delete is optimistic
 * (`DELETE /api/reviews/{id}`) — both revert and toast on failure, same pattern as
 * `PriceTrackingViewModel`. Transient failures on an already-populated list surface via
 * [messages] rather than replacing the grid with a full error state.
 */
@HiltViewModel
class MyReviewsViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    var uiState by mutableStateOf<UiState<List<Review>>>(UiState.Loading)
        private set

    private val _messages = Channel<String>(Channel.BUFFERED)
    val messages: Flow<String> = _messages.receiveAsFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    private fun load() {
        loadJob?.cancel()
        uiState = UiState.Loading
        loadJob = viewModelScope.launch {
            when (val result = repository.getMine()) {
                is NetworkResult.Success -> {
                    val mapped = result.data.map { it.toUiReview() }
                    uiState = if (mapped.isEmpty()) UiState.Empty else UiState.Success(mapped)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "My Reviews load failed: ${result.error}")
                    uiState = UiState.Error(reviewErrorMessages.toUserMessage(result.error))
                }
            }
        }
    }

    fun retry() = load()

    /** Optimistically flips [Review.isHidden], reverting (and toasting) if the PATCH fails. */
    fun toggleHidden(id: String) {
        val target = currentList().firstOrNull { it.id == id } ?: return
        val nextHidden = !target.isHidden
        applyLocal { list -> list.map { if (it.id == id) it.copy(isHidden = nextHidden) else it } }
        viewModelScope.launch {
            val result = repository.setHidden(id, nextHidden)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Set hidden failed: ${result.error}")
                // Revert relative to whatever the list looks like NOW, not a snapshot taken
                // before this coroutine suspended — a concurrent toggle/delete on another item
                // may have changed the list in between, and reverting against a stale baseline
                // would silently undo that unrelated change too.
                applyLocal { list -> list.map { if (it.id == id) it.copy(isHidden = !nextHidden) else it } }
                _messages.send(reviewErrorMessages.toUserMessage(result.error))
            }
        }
    }

    /** Optimistically removes the post, reverting (and toasting) if the DELETE fails. */
    fun delete(id: String) {
        val index = currentList().indexOfFirst { it.id == id }
        if (index == -1) return
        val removed = currentList()[index]
        applyLocal { list -> list.filterNot { it.id == id } }
        viewModelScope.launch {
            val result = repository.deleteReview(id)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Delete review failed: ${result.error}")
                // Re-insert into the CURRENT list (see comment in toggleHidden) rather than
                // restoring a pre-delete snapshot that could clobber other concurrent edits.
                applyLocal { list ->
                    if (list.any { it.id == id }) list
                    else list.toMutableList().apply { add(index.coerceIn(0, size), removed) }
                }
                _messages.send(reviewErrorMessages.toUserMessage(result.error))
            }
        }
    }

    private fun currentList(): List<Review> = (uiState as? UiState.Success)?.data ?: emptyList()

    private fun applyLocal(transform: (List<Review>) -> List<Review>) {
        val next = transform(currentList())
        uiState = if (next.isEmpty()) UiState.Empty else UiState.Success(next)
    }

    private fun BackendReview.toUiReview(): Review = Review(
        id = id,
        placeName = placeName,
        body = body,
        photoUrl = thumbnail ?: photos?.firstOrNull(),
        rating = rating,
        isHidden = isHidden,
        likeCount = likeCount,
        commentCount = commentCount,
    )

    private companion object {
        const val TAG = "MyReviewsViewModel"
    }
}
