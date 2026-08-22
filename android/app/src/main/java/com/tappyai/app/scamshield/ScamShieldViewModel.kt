package com.tappyai.app.scamshield

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.language.AppLanguage
import com.tappyai.app.language.AppLanguageResolver
import com.tappyai.app.scamshield.data.ScamCheckOutcome
import com.tappyai.app.scamshield.data.ScamShieldRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * State for the Scam Shield screen (`/scam-shield` on the web).
 *
 * The URL tab only. The web also offers QR-image upload; that is a separate endpoint and a
 * separate capability (camera/photo picking) and is deliberately NOT claimed here rather than
 * half-built — see the note in [ScamShieldScreen].
 *
 * 🚨 [state] can only reach [ScamShieldUiState.Result] by way of a backend verdict. Every other
 * path lands in [ScamShieldUiState.Failed], which the screen renders as an unresolved check.
 */
@HiltViewModel
class ScamShieldViewModel @Inject constructor(
    private val repository: ScamShieldRepository,
) : ViewModel() {

    var url by mutableStateOf("")
        private set

    var state by mutableStateOf<ScamShieldUiState>(ScamShieldUiState.Idle)
        private set

    private var inFlight: Job? = null

    fun onUrlChange(value: String) {
        url = value
    }

    fun check() {
        val target = url.trim()
        if (target.isEmpty() || state is ScamShieldUiState.Checking) return

        // Replace any earlier check rather than racing it: an older response arriving late must not
        // overwrite the verdict for the URL now on screen.
        inFlight?.cancel()
        state = ScamShieldUiState.Checking
        inFlight = viewModelScope.launch {
            // Read at call time, never cached — the user can change language between checks, and
            // AppLanguageResolver is the same authority the outgoing Accept-Language header uses.
            val vietnamese = AppLanguageResolver.currentTag() == AppLanguage.Vietnamese.tag
            state = when (val outcome = repository.check(target, preferVietnameseLabels = vietnamese)) {
                is ScamCheckOutcome.Verdict -> ScamShieldUiState.Result(outcome.result)
                is ScamCheckOutcome.Failed -> ScamShieldUiState.Failed(outcome.failure)
            }
        }
    }

    fun reset() {
        inFlight?.cancel()
        inFlight = null
        state = ScamShieldUiState.Idle
    }
}

sealed interface ScamShieldUiState {
    data object Idle : ScamShieldUiState
    data object Checking : ScamShieldUiState
    data class Result(val result: ScamCheckResult) : ScamShieldUiState
    data class Failed(val failure: ScamCheckFailure) : ScamShieldUiState
}
