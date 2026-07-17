package com.tappyai.app.saved

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.saved.data.SavedErrorMessages
import com.tappyai.app.saved.data.SavedRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Saved screen. Loads the unified library from two backends — `GET /api/favorites`
 * (saved places) and `GET /api/reviews/saved` (bookmarked reviews), fetched concurrently — and
 * combines them into the screen's single [SavedData]. If one call fails the other still shows
 * (availability over strictness); only a both-fail surfaces [UiState.Error].
 *
 * The public surface ([uiState], [removeFavorite]) is unchanged from the seed version, so the
 * screen is untouched. [removeFavorite] is now a real optimistic `DELETE /api/favorites`, reverting
 * the local removal if the backend call fails.
 */
@HiltViewModel
class SavedViewModel @Inject constructor(
    private val repository: SavedRepository,
    private val logger: LoggerProvider,
    private val savedErrorMessages: SavedErrorMessages,
    private val stringProvider: StringProvider,
) : ViewModel() {

    var uiState by mutableStateOf<UiState<SavedData>>(UiState.Loading)
        private set

    private var loadJob: Job? = null

    init {
        load()
    }

    fun load() {
        loadJob?.cancel()
        uiState = UiState.Loading
        loadJob = viewModelScope.launch {
            val favDeferred = async { repository.getFavorites() }
            val revDeferred = async { repository.getSavedReviews() }
            val favResult = favDeferred.await()
            val revResult = revDeferred.await()

            val favorites = (favResult as? NetworkResult.Success)?.data
            val reviews = (revResult as? NetworkResult.Success)?.data

            if (favorites == null && reviews == null) {
                val networkError = (favResult as? NetworkResult.Error)?.error
                    ?: (revResult as? NetworkResult.Error)?.error
                logger.e(TAG, "Saved load failed: $networkError")
                uiState = UiState.Error(
                    networkError?.let { savedErrorMessages.toUserMessage(it) }
                        ?: stringProvider.get(R.string.saved_load_error_fallback),
                )
            } else {
                val data = SavedData(
                    favorites = favorites ?: emptyList(),
                    reviews = reviews ?: emptyList(),
                )
                uiState = if (data.isEmpty) UiState.Empty else UiState.Success(data)
            }
        }
    }

    /**
     * Removes a favorite place: optimistically drops it from the list, then calls the backend and
     * restores the pre-removal snapshot if the cancel fails. Matches the screen's instant, no-confirm
     * delete affordance (no snackbar exists on this screen, so a failure silently restores the item).
     */
    fun removeFavorite(placeId: String) {
        val snapshot = (uiState as? UiState.Success)?.data ?: return
        val next = snapshot.copy(favorites = snapshot.favorites.filterNot { it.placeId == placeId })
        uiState = if (next.isEmpty) UiState.Empty else UiState.Success(next)
        viewModelScope.launch {
            val result = repository.removeFavorite(placeId)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Remove favorite failed: ${result.error}")
                uiState = if (snapshot.isEmpty) UiState.Empty else UiState.Success(snapshot)
            }
        }
    }

    private companion object {
        const val TAG = "SavedViewModel"
    }
}
