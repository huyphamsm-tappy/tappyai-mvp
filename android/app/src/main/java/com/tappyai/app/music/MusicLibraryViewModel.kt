package com.tappyai.app.music

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.music.data.MusicErrorMessages
import com.tappyai.app.music.data.MusicRepository
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Music Library — mirrors the web `/music` page: browse by category (paginated,
 * `GET /api/music/tracks`) or search across everything (debounced, `GET /api/music/tracks/
 * search`), which hides the category tabs while active. Both endpoints are public (no sign-in
 * required), matching the web.
 */
@HiltViewModel
class MusicLibraryViewModel @Inject constructor(
    private val repository: MusicRepository,
    private val logger: LoggerProvider,
    private val musicErrorMessages: MusicErrorMessages,
) : ViewModel() {

    var categories by mutableStateOf<List<MusicCategory>>(emptyList())
        private set

    var query by mutableStateOf("")
        private set

    /** Selected category id, or `null` for the "All" tab. */
    var selectedCategoryId: String? by mutableStateOf(null)
        private set

    var tracksState by mutableStateOf<UiState<List<MusicTrack>>>(UiState.Loading)
        private set

    var isLoadingMore by mutableStateOf(false)
        private set

    val isSearching: Boolean
        get() = query.isNotBlank()

    private var currentPage = 0
    private var hasMore = false
    private var loadJob: Job? = null
    private var searchDebounceJob: Job? = null

    init {
        loadCategories()
        loadTracks(reset = true)
    }

    private fun loadCategories() {
        viewModelScope.launch {
            when (val result = repository.getCategories()) {
                is NetworkResult.Success -> categories = result.data
                is NetworkResult.Error -> logger.e(TAG, "Categories load failed: ${result.error}")
            }
        }
    }

    fun onQueryChange(value: String) {
        query = value
        searchDebounceJob?.cancel()
        searchDebounceJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            loadTracks(reset = true)
        }
    }

    fun onSelectCategory(categoryId: String?) {
        if (selectedCategoryId == categoryId) return
        selectedCategoryId = categoryId
        loadTracks(reset = true)
    }

    fun retry() = loadTracks(reset = true)

    /** Call when the list's last visible row nears the end — appends the next page, or no-ops if
     *  a load is already in flight or the backend already reported no more pages. */
    fun loadMore() {
        if (isLoadingMore || !hasMore) return
        loadTracks(reset = false)
    }

    private fun loadTracks(reset: Boolean) {
        loadJob?.cancel()
        if (reset) {
            currentPage = 0
            tracksState = UiState.Loading
        } else {
            isLoadingMore = true
        }
        loadJob = viewModelScope.launch {
            val result = if (isSearching) {
                repository.searchTracks(query.trim(), currentPage)
            } else {
                repository.getTracks(selectedCategoryId, currentPage)
            }
            when (result) {
                is NetworkResult.Success -> {
                    val page = result.data
                    hasMore = page.hasMore
                    currentPage = page.page + 1
                    val existing = (tracksState as? UiState.Success)?.data ?: emptyList()
                    val combined = if (reset) page.tracks else existing + page.tracks
                    tracksState = if (combined.isEmpty()) UiState.Empty else UiState.Success(combined)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Tracks load failed: ${result.error}")
                    // A failed "load more" silently drops — the existing list stays visible, matching
                    // standard infinite-scroll UX (only a fresh/reset load surfaces a hard error state).
                    if (reset) {
                        tracksState = UiState.Error(musicErrorMessages.toUserMessage(result.error))
                    }
                }
            }
            isLoadingMore = false
        }
    }

    private companion object {
        const val TAG = "MusicLibraryViewModel"
        const val SEARCH_DEBOUNCE_MS = 400L
    }
}
