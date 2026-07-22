package com.tappyai.app.home

import androidx.lifecycle.ViewModel
import com.tappyai.core.common.UiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

/**
 * Backs the shell's top-level loading state. Phase 1C.1 is shell-only — there is **no real
 * initial-home data to load yet**, so this resolves to [UiState.Success] immediately with no
 * artificial delay (faking a spinner would be dishonest). The [UiState.Loading] branch is
 * wired end-to-end (exposed here, rendered in [HomeShellScreen]) so that when a real
 * "load the home surface" step lands in a later phase, only this ViewModel's body changes —
 * the shell already knows how to show the loading state.
 */
@HiltViewModel
class HomeShellViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow<UiState<Unit>>(UiState.Loading)
    val uiState: StateFlow<UiState<Unit>> = _uiState.asStateFlow()

    init {
        _uiState.value = UiState.Success(Unit)
    }
}
