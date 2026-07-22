package com.tappyai.core.common

/**
 * Project-wide screen-state convention, replacing ad-hoc `isLoading`/`hasError`/`isEmpty`
 * boolean combinations (which allow invalid states like loading+error simultaneously true).
 * [Idle] is distinct from [Loading]: a screen that hasn't started fetching yet (e.g. waiting
 * on user input before a search) is [Idle], not [Loading].
 */
sealed interface UiState<out T> {
    data object Idle : UiState<Nothing>
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data object Empty : UiState<Nothing>
    data class Error(val message: String, val throwable: Throwable? = null) : UiState<Nothing>
}
