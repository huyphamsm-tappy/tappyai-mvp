package com.tappyai.app.reviews.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewErrorMessages
import com.tappyai.app.reviews.data.ReviewsRepository
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Server-side review search (GET /api/reviews/feed?search=…), replacing the old client-side seed
 * filter. Queries are debounced so a fetch fires only after the user pauses typing. [hasSearched]
 * distinguishes "no results" (show empty state) from "haven't typed yet" (show nothing).
 */
data class ReviewSearchUiState(
    val query: String = "",
    val results: List<Review> = emptyList(),
    val isSearching: Boolean = false,
    val error: String? = null,
    val hasSearched: Boolean = false,
)

@OptIn(FlowPreview::class)
@HiltViewModel
class ReviewSearchViewModel @Inject constructor(
    private val repository: ReviewsRepository,
    private val logger: LoggerProvider,
    private val reviewErrorMessages: ReviewErrorMessages,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewSearchUiState())
    val uiState: StateFlow<ReviewSearchUiState> = _uiState.asStateFlow()

    private val queryFlow = MutableStateFlow("")

    init {
        viewModelScope.launch {
            queryFlow
                .map { it.trim() }
                .debounce(DEBOUNCE_MS)
                .distinctUntilChanged()
                .collect { q -> runSearch(q) }
        }
    }

    fun onQueryChange(value: String) {
        _uiState.update { it.copy(query = value) }
        if (value.isBlank()) {
            // Clear immediately when the field is emptied — don't wait for the debounce.
            _uiState.update { it.copy(results = emptyList(), isSearching = false, error = null, hasSearched = false) }
        }
        queryFlow.value = value
    }

    private suspend fun runSearch(query: String) {
        if (query.length < MIN_QUERY) {
            _uiState.update { it.copy(results = emptyList(), isSearching = false, error = null, hasSearched = false) }
            return
        }
        _uiState.update { it.copy(isSearching = true, error = null) }
        when (val result = repository.getFeed(page = 0, limit = RESULTS_LIMIT, sort = "latest", search = query)) {
            is NetworkResult.Success -> _uiState.update {
                it.copy(results = result.data, isSearching = false, error = null, hasSearched = true)
            }
            is NetworkResult.Error -> {
                logger.e(TAG, "Search failed: ${result.error}")
                _uiState.update {
                    it.copy(isSearching = false, error = reviewErrorMessages.toUserMessage(result.error), hasSearched = true)
                }
            }
        }
    }

    private companion object {
        const val TAG = "ReviewSearchViewModel"
        const val DEBOUNCE_MS = 350L
        const val MIN_QUERY = 2
        const val RESULTS_LIMIT = 20
    }
}
