package com.tappyai.app.preferences

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.preferences.data.PreferencesErrorMessages
import com.tappyai.app.preferences.data.PreferencesRepository
import com.tappyai.core.common.StringProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One-shot outcome of a Save, delivered once to the screen (shown as a Toast). */
sealed interface PreferencesEvent {
    data object Saved : PreferencesEvent
    data class SaveFailed(val message: String) : PreferencesEvent
}

/**
 * Editable form state for My Preferences, backed by `/api/preferences`. Loads the user's saved
 * selections on init (GET) and persists them on [save] (PUT structured + POST freeform list). The
 * option sets themselves stay static (product constants). [gender] is form-only — the endpoint has
 * no gender field, so it isn't loaded or saved. The screen has no error/loading UI, so a load
 * failure just leaves the form at its defaults (logged, not surfaced).
 */
@HiltViewModel
class PreferencesViewModel @Inject constructor(
    private val repository: PreferencesRepository,
    private val logger: LoggerProvider,
    private val preferencesErrorMessages: PreferencesErrorMessages,
    private val stringProvider: StringProvider,
) : ViewModel() {

    // Only true after a successful GET. Guards [save] from PUT/POSTing the form's *default* values
    // over the user's real backend data when the initial load failed — the backend upserts
    // unconditionally with no merge, so an unguarded save on an unloaded form silently wipes their
    // saved preferences. See the load-error branch below.
    private var hasLoaded = false

    var budget by mutableStateOf<BudgetLevel?>(null)
        private set
    var gender by mutableStateOf<Gender?>(null)
        private set
    var cuisines by mutableStateOf<Set<String>>(emptySet())
        private set
    var preferences by mutableStateOf<List<String>>(emptyList())
        private set
    var dietary by mutableStateOf("")
        private set

    var isSaving by mutableStateOf(false)
        private set

    private val _events = Channel<PreferencesEvent>(Channel.BUFFERED)
    val events: Flow<PreferencesEvent> = _events.receiveAsFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            when (val result = repository.getPreferences()) {
                is NetworkResult.Success -> {
                    budget = result.data.budget
                    cuisines = result.data.cuisines
                    dietary = result.data.dietary
                    preferences = result.data.preferences
                    hasLoaded = true
                    // gender: no backend field — remains the current (unloaded) selection.
                }
                is NetworkResult.Error -> logger.e(TAG, "Preferences load failed: ${result.error}")
            }
        }
    }

    /** Single-select, deselect on re-tap (matches the web). */
    fun toggleBudget(level: BudgetLevel) {
        budget = if (budget == level) null else level
    }

    fun toggleGender(value: Gender) {
        gender = if (gender == value) null else value
    }

    /** Multi-select. */
    fun toggleCuisine(item: String) {
        cuisines = if (item in cuisines) cuisines - item else cuisines + item
    }

    fun addPreference(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || trimmed in preferences || preferences.size >= 50) return
        preferences = preferences + trimmed
    }

    fun removePreference(pref: String) {
        preferences = preferences - pref
    }

    fun onDietaryChange(value: String) {
        dietary = value.take(200)
    }

    fun save() {
        if (isSaving) return
        // Refuse to save a form we never successfully loaded — otherwise the unconditional backend
        // upsert would overwrite the user's real saved preferences with this form's defaults.
        if (!hasLoaded) {
            viewModelScope.launch {
                _events.send(PreferencesEvent.SaveFailed(stringProvider.get(R.string.preferences_error_not_loaded)))
            }
            return
        }
        isSaving = true
        viewModelScope.launch {
            val result = repository.savePreferences(
                budget = budget,
                cuisines = cuisines,
                dietary = dietary,
                preferences = preferences,
            )
            isSaving = false
            when (result) {
                is NetworkResult.Success -> _events.send(PreferencesEvent.Saved)
                is NetworkResult.Error -> {
                    logger.e(TAG, "Preferences save failed: ${result.error}")
                    _events.send(PreferencesEvent.SaveFailed(preferencesErrorMessages.toUserMessage(result.error)))
                }
            }
        }
    }

    private companion object {
        const val TAG = "PreferencesViewModel"
    }
}
