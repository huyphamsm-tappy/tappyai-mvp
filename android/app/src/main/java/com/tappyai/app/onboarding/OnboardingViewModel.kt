package com.tappyai.app.onboarding

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.onboarding.data.OnboardingRepository
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Fired once when the wizard is finished (submitted or skipped) so the screen can leave. */
sealed interface OnboardingEvent {
    data object Finished : OnboardingEvent
}

/**
 * State for the 2-step onboarding wizard — mirrors the web's `OnboardingPage`.
 *
 * Step 1 multi-selects interests; step 2 single-selects a city (catalog value or free text). Both
 * steps have a Skip that jumps ahead / finishes without a gate, exactly as the web does. Finishing
 * posts `{ interests, city }` and always leaves the screen afterward — the web navigates on
 * completion regardless of the request's outcome, so a failed save never traps the user here.
 */
@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val repository: OnboardingRepository,
    private val logger: LoggerProvider,
) : ViewModel() {

    var catalogState by mutableStateOf<UiState<OnboardingCatalog>>(UiState.Loading)
        private set

    // Restored from SavedStateHandle (survives process death, unlike a plain ViewModel property)
    // and every setter below mirrors back into it — a low-memory background kill mid-wizard no
    // longer silently resets the user back to step 1 with their picks discarded.
    var step by mutableStateOf(savedStateHandle.get<Int>(KEY_STEP) ?: 1)
        private set

    var selectedInterests by mutableStateOf(savedStateHandle.get<ArrayList<String>>(KEY_INTERESTS)?.toSet() ?: emptySet())
        private set

    var city by mutableStateOf(savedStateHandle.get<String>(KEY_CITY).orEmpty())
        private set

    var isSubmitting by mutableStateOf(false)
        private set

    private val _events = Channel<OnboardingEvent>(Channel.BUFFERED)
    val events: Flow<OnboardingEvent> = _events.receiveAsFlow()

    private var loadJob: Job? = null

    init {
        loadCatalog()
    }

    fun retry() = loadCatalog()

    private fun loadCatalog() {
        loadJob?.cancel()
        catalogState = UiState.Loading
        loadJob = viewModelScope.launch {
            catalogState = when (val result = repository.getCatalog()) {
                is NetworkResult.Success -> UiState.Success(result.data)
                is NetworkResult.Error -> {
                    logger.e(TAG, "Onboarding catalog load failed: ${result.error}")
                    UiState.Error("")
                }
            }
        }
    }

    fun toggleInterest(id: String) {
        selectedInterests = if (id in selectedInterests) selectedInterests - id else selectedInterests + id
        savedStateHandle[KEY_INTERESTS] = ArrayList(selectedInterests)
    }

    /** Next / Skip on step 1 both advance to step 2 (the web gates only the Next *button's*
     *  enabled state on a non-empty selection; Skip bypasses it). */
    fun goToLocationStep() { step = 2; savedStateHandle[KEY_STEP] = step }

    /** A catalog city chip, or free text from the "other city" field. */
    fun onCityChange(value: String) { city = value; savedStateHandle[KEY_CITY] = value }

    /** Finish (or Skip) on step 2 — submit then leave. Idempotent against double taps. */
    fun finish() {
        if (isSubmitting) return
        isSubmitting = true
        viewModelScope.launch {
            repository.submit(interests = selectedInterests.toList(), city = city.trim())
            isSubmitting = false
            _events.send(OnboardingEvent.Finished)
        }
    }

    private companion object {
        const val TAG = "OnboardingViewModel"
        const val KEY_STEP = "onboarding_step"
        const val KEY_INTERESTS = "onboarding_interests"
        const val KEY_CITY = "onboarding_city"
    }
}
