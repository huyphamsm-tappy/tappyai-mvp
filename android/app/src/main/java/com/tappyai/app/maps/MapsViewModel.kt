package com.tappyai.app.maps

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.maps.data.MapsErrorMessages
import com.tappyai.app.maps.data.MapsRepository
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Backs the Maps screen with real place data from `GET /api/favorites` (the user's saved places) —
 * the only REST endpoint providing place fields rich enough for the cards/detail/filter. The full
 * list is loaded once ([load]); category + query filtering is client-side (presentation only — the
 * favorites endpoint has no filter/search params, matching the screen's existing local-filter
 * behavior), and does not duplicate any backend business logic. [removeFavorite] backs the detail
 * sheet's "Remove" action via the same `DELETE /api/favorites` the Saved screen already uses.
 */
@HiltViewModel
class MapsViewModel @Inject constructor(
    private val repository: MapsRepository,
    private val logger: LoggerProvider,
    private val mapsErrorMessages: MapsErrorMessages,
) : ViewModel() {

    var query by mutableStateOf("")
        private set
    var viewMode by mutableStateOf(MapsViewMode.Map)
        private set
    var selectedFilter by mutableStateOf(PlaceCategory.All)
        private set
    var selectedPlace by mutableStateOf<MapPlace?>(null)
        private set

    // The raw loaded list (Loading → Success(all) / Error). placesState() derives the filtered
    // view from this so a fetch failure surfaces as an error+retry, distinct from an empty filter.
    private var loadState by mutableStateOf<UiState<List<MapPlace>>>(UiState.Loading)

    private var loadJob: Job? = null

    init {
        load()
    }

    fun onQueryChange(value: String) { query = value }
    fun onViewModeChange(mode: MapsViewMode) { viewMode = mode }
    fun onFilterChange(category: PlaceCategory) { selectedFilter = category }
    fun onSelectPlace(place: MapPlace) { selectedPlace = place }
    fun onDismissPlaceDetail() { selectedPlace = null }

    /** (Re)load the saved-places list. Used for the initial load and the error-state retry. */
    fun load() {
        loadJob?.cancel()
        loadState = UiState.Loading
        loadJob = viewModelScope.launch {
            loadState = when (val result = repository.getSavedPlaces()) {
                is NetworkResult.Success -> UiState.Success(result.data)
                is NetworkResult.Error -> {
                    logger.e(TAG, "Saved places load failed: ${result.error}")
                    UiState.Error(mapsErrorMessages.toUserMessage(result.error))
                }
            }
        }
    }

    fun retry() = load()

    /**
     * Removes a favorite (the detail sheet's "Remove" action — every place on this screen is
     * already a favorite by construction, see [MapPlace]'s doc): optimistically drops it from
     * [loadState], then calls the backend and restores it on failure. Reverts against whatever
     * [loadState] holds *at revert time*, not a snapshot captured before the network call — a
     * concurrent [load] finishing in between would otherwise be silently clobbered by restoring a
     * stale list.
     */
    fun removeFavorite(placeId: String) {
        val before = (loadState as? UiState.Success)?.data ?: return
        val removed = before.firstOrNull { it.placeId == placeId } ?: return
        loadState = UiState.Success(before.filterNot { it.placeId == placeId })
        selectedPlace = null
        viewModelScope.launch {
            val result = repository.removeFavorite(placeId)
            if (result is NetworkResult.Error) {
                logger.e(TAG, "Remove favorite failed: ${result.error}")
                val current = (loadState as? UiState.Success)?.data ?: emptyList()
                if (current.none { it.placeId == placeId }) {
                    loadState = UiState.Success(current + removed)
                }
            }
        }
    }

    /**
     * The places matching the current filter + query, as a [UiState]. Loading/Error pass through
     * from the fetch so the screen can render a spinner or an error+retry; on success the loaded
     * list is filtered client-side, collapsing to [UiState.Empty] when nothing matches (or when the
     * user has no saved places yet).
     */
    fun placesState(): UiState<List<MapPlace>> = when (val state = loadState) {
        is UiState.Success -> {
            val filtered = state.data.filter { place ->
                (selectedFilter == PlaceCategory.All || place.category == selectedFilter) &&
                    (query.isBlank() || place.name.contains(query.trim(), ignoreCase = true))
            }
            if (filtered.isEmpty()) UiState.Empty else UiState.Success(filtered)
        }
        else -> state
    }

    private companion object {
        const val TAG = "MapsViewModel"
    }
}
