package com.tappyai.app.reviews.ui

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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

/** One-shot outcome of a submit, delivered once to the screen (Toast + navigate on success). */
sealed interface ComposerEvent {
    data object Posted : ComposerEvent
    data class Failed(val message: String) : ComposerEvent
}

data class ReviewComposerUiState(val isPosting: Boolean = false)

@HiltViewModel
class ReviewComposerViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    /** Present only when reached via [com.tappyai.app.navigation.AppRoute.ComposerWithSound]
     *  (Sound Detail's "Use this sound") — absent for a normal compose-from-Reviews-tab visit,
     *  since that route carries no such nav args. [attachedTrackTitle] rides along purely for
     *  display (the "Using: {title}" chip) so the screen doesn't need a second fetch. */
    val attachedTrackId: String? = savedStateHandle["trackId"]
    val attachedTrackTitle: String? = savedStateHandle["trackTitle"]

    /**
     * Set only when reached via [com.tappyai.app.navigation.AppRoute.ComposerForPlace] (a past
     * booking's Review button). When present, [submit] sends this real `place_id` instead of
     * slugifying the typed name, and [prefilledPlaceName] seeds the place field.
     */
    private val presetPlaceId: String? = savedStateHandle["placeId"]
    val prefilledPlaceName: String? = savedStateHandle["placeName"]

    private val _uiState = MutableStateFlow(ReviewComposerUiState())
    val uiState: StateFlow<ReviewComposerUiState> = _uiState.asStateFlow()

    private val _events = Channel<ComposerEvent>(Channel.BUFFERED)
    val events: Flow<ComposerEvent> = _events.receiveAsFlow()

    /**
     * Submits a text review via POST /api/reviews. The current composer UI collects only body,
     * rating and a free-text place name — it has no structured place picker or media picker — so
     * [placeId] is derived as a slug of [placeName]. The backend requires a place, so a blank
     * place name yields a 400 which we surface as a Toast (leaving validation to the backend,
     * which owns that business rule). [includeSound] lets the screen drop the pre-attached track
     * (its "x" on the "Using: {title}" chip) without needing a mutable copy of [attachedTrackId].
     */
    fun submit(body: String, rating: Int, placeName: String, includeSound: Boolean = true) {
        if (_uiState.value.isPosting) return
        _uiState.update { it.copy(isPosting = true) }
        viewModelScope.launch {
            val result = repository.createReview(
                // A booking-sourced review carries the venue's real place_id; a free-text place
                // has none, so it falls back to a slug of the typed name as before.
                placeId = presetPlaceId ?: slugify(placeName),
                placeName = placeName.trim(),
                body = body.trim(),
                rating = rating.takeIf { it in 1..5 },
                musicTrackId = attachedTrackId.takeIf { includeSound },
            )
            _uiState.update { it.copy(isPosting = false) }
            when (result) {
                is NetworkResult.Success -> _events.send(ComposerEvent.Posted)
                is NetworkResult.Error -> {
                    logger.e(TAG, "Create review failed: ${result.error}")
                    _events.send(ComposerEvent.Failed(reviewErrorMessages.toPostFailureMessage(result.error)))
                }
            }
        }
    }

    /**
     * Stable per-place key from a free-text display name — byte-for-byte the web's own algorithm
     * for the identical case (`src/app/reviews/new/page.tsx`: `'community_' + placeName.trim()
     * .toLowerCase().replace(/\s+/g, '_')`). Must match exactly: this is the join key two reviews
     * of the same real-world place group under, and a divergent algorithm here would silently
     * fragment the same place into separate placeIds depending on which platform posted first.
     */
    private fun slugify(name: String): String = "community_" + name.trim().lowercase().replace(Regex("\\s+"), "_")

    private companion object {
        const val TAG = "ReviewComposerViewModel"
    }
}
