package com.tappyai.app.discovery

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.navigation.toRoute
import com.tappyai.core.common.UiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

/**
 * State for one Discovery domain's browse screen. Resolves its [group] from the route's
 * `groupId` (backend-stable [DiscoveryGroup.id]). UI-only foundation: [resultsState] has no data
 * source yet and stays [UiState.Empty] — the screen renders that honestly (never fake venues),
 * ready to swap in real results keyed by [selectedCategory]'s `id` later.
 */
@HiltViewModel
class DiscoveryCategoryViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    val group: DiscoveryGroup =
        DiscoveryGroup.fromId(savedStateHandle.toRoute<DiscoveryRoute.Category>().groupId)

    var query by mutableStateOf("")
        private set
    var selectedCategory by mutableStateOf(group.categories.first())
        private set

    private val _resultsState = MutableStateFlow<UiState<List<String>>>(UiState.Empty)
    val resultsState: StateFlow<UiState<List<String>>> = _resultsState.asStateFlow()

    fun onQueryChange(value: String) {
        query = value
    }

    fun onSelectCategory(category: DiscoveryCategory) {
        selectedCategory = category
    }
}
