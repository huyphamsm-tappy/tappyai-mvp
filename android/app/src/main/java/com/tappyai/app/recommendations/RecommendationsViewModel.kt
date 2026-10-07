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
/** Whether the page must first ask 18+ (web: `apiFetch` sends an age refusal to /age-check). */
enum class RecommendationsAgeState { None, Required }

@HiltViewModel
class RecommendationsViewModel @Inject constructor(
    private val repository: RecommendationsRepository,
    private val stringProvider: StringProvider,
    private val logger: LoggerProvider,
    private val authRepository: com.tappyai.features.auth.data.AuthRepository,
) : ViewModel() {

    private val _ageState = MutableStateFlow(RecommendationsAgeState.None)
    val ageState: StateFlow<RecommendationsAgeState> = _ageState.asStateFlow()

    /** A guest declares on the device; an account PATCHes its date of birth — same screen. */
    val isGuest: Boolean get() = authRepository.isAnonymous() || !authRepository.hasSession()

    /** Set once the 18+ screen has been answered, so a guest is never looped back to it (R6). */
    private var ageAnswered = false

    fun onAgeConfirmed() {
        ageAnswered = true
        _ageState.value = RecommendationsAgeState.None
        load()
    }

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
                    // 403 = an age refusal (age_declaration_required / age_verification_required):
                    // ask 18+ instead of showing "Không tải được" (parity 2026-09-28, L5).
                    val code = (result.error as? NetworkError.Http)?.code
                    when {
                        code == 403 && !ageAnswered -> RecommendationsAgeState.Required
                        else -> null
                    }?.let { _ageState.value = it }
                    // Still 403 after the 18+ answer: the route has no guest path (ANDROID-REQUESTS
                    // R6) — the way on is an account, so say that instead of asking again.
                    val isAuth = code == 401 || (code == 403 && ageAnswered)
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
