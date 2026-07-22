package com.tappyai.app.recommendations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.recommendations.data.RecommendationsRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the recommendations screen ("✨ Gợi ý cho bạn") — mirrors the web `/recommendations`
 * page. Fetches `GET api/recommendations` once on init; an empty result is still [UiState.Success]
 * (the screen renders the "not enough data yet" empty block, alongside any explanation), matching
 * the web which never treats zero recs as an error. A 401 maps to the sign-in message; any other
 * failure to the generic retry message — the same two-way split the web page makes.
 */
@HiltViewModel
class RecommendationsViewModel @Inject constructor(
    private val repository: RecommendationsRepository,
    private val stringProvider: StringProvider,
    private val logger: LoggerProvider,
) : ViewModel() {

    private val _state = MutableStateFlow<UiState<Recommendations>>(UiState.Loading)
    val state: StateFlow<UiState<Recommendations>> = _state.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        loadJob?.cancel()
        _state.value = UiState.Loading
        loadJob = viewModelScope.launch {
            _state.value = when (val result = repository.getRecommendations()) {
                is NetworkResult.Success -> UiState.Success(result.data)
                is NetworkResult.Error -> {
                    logger.e(TAG, "Recommendations load failed: ${result.error}")
                    val isAuth = (result.error as? NetworkError.Http)?.code == 401
                    val messageRes =
                        if (isAuth) R.string.recommendations_error_auth
                        else R.string.recommendations_error_generic
                    UiState.Error(stringProvider.get(messageRes))
                }
            }
        }
    }

    private companion object {
        const val TAG = "RecommendationsViewModel"
    }
}
