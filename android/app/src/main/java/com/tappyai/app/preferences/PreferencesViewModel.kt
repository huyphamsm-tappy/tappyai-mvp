package com.tappyai.app.preferences

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
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
 * option sets themselves stay static (product constants). [gender] is NOT an `/api/preferences`
 * field — it lives in Supabase auth metadata, so it is loaded/saved via [AuthRepository] the same
 * way the web does. The screen has no error/loading UI, so a load failure just leaves the form at
 * its defaults (logged, not surfaced).
 */
@HiltViewModel
class PreferencesViewModel @Inject constructor(
    private val repository: PreferencesRepository,
    private val logger: LoggerProvider,
    private val preferencesErrorMessages: PreferencesErrorMessages,
    private val stringProvider: StringProvider,
    private val authRepository: com.tappyai.features.auth.data.AuthRepository,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    // Certification-sprint fix: this used to be a single flag serving both purposes below, which
    // was a real data-loss bug — if the user tapped a chip before the initial GET resolved, the
    // flag went true from that tap alone, so load()'s success branch (gated on the SAME flag)
    // skipped seeding every OTHER field from the server. Those fields stayed at their blank
    // in-memory default, and since save() does an unconditional upsert with no server-side
    // merge, tapping Save right after silently wiped the user's real saved cuisines/dietary/
    // preferences on the backend. Split into two flags with distinct, non-overlapping triggers:

    // Read ONCE at construction — true only when this instance is restoring a real draft
    // persisted by a PREVIOUS instance (process death mid-edit). Never set true by in-session
    // user interaction, so it can safely gate [load]'s decision to seed from the server: a
    // same-session edit made before the GET resolves does not stop the other fields from being
    // correctly populated once the response arrives.
    private val restoredFromDraft = savedStateHandle.get<Boolean>(KEY_HAS_DRAFT) == true

    // Guards [save] from PUT/POSTing the form's *default* values over the user's real backend
    // data when the initial load failed or hasn't completed yet — the backend upserts
    // unconditionally with no merge, so an unguarded save on an unloaded form would silently
    // wipe their saved preferences. Set true once the initial GET actually completes, or
    // immediately if restoring a draft (which implies an earlier GET already succeeded).
    private var hasLoadedFromServer = restoredFromDraft

    var budget by mutableStateOf(
        savedStateHandle.get<String>(KEY_BUDGET)?.let { runCatching { BudgetLevel.valueOf(it) }.getOrNull() }
    )
        private set
    // Seed from a saved draft first, else from Supabase auth metadata (web reads
    // `user_metadata.gender`). Best-effort: null when no user is loaded yet.
    var gender by mutableStateOf(
        savedStateHandle.get<String>(KEY_GENDER)?.let { runCatching { Gender.valueOf(it) }.getOrNull() }
            ?: Gender.fromWire(authRepository.currentGender())
    )
        private set
    var cuisines by mutableStateOf(savedStateHandle.get<ArrayList<String>>(KEY_CUISINES)?.toSet() ?: emptySet())
        private set
    var preferences by mutableStateOf(savedStateHandle.get<ArrayList<String>>(KEY_PREFS) ?: emptyList<String>())
        private set
    var dietary by mutableStateOf(savedStateHandle.get<String>(KEY_DIETARY).orEmpty())
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
                    // Only skip seeding when restoring a real prior-session draft — never when
                    // the user has merely tapped something in THIS session before this GET
                    // resolved (see restoredFromDraft's doc comment for why that distinction
                    // matters).
                    if (!restoredFromDraft) {
                        budget = result.data.budget
                        cuisines = result.data.cuisines
                        dietary = result.data.dietary
                        preferences = result.data.preferences
                        persistDraft()
                        // gender is not part of this /api/preferences payload — it's seeded from
                        // auth metadata at construction and saved via AuthRepository in save().
                    }
                    hasLoadedFromServer = true
                }
                is NetworkResult.Error -> logger.e(TAG, "Preferences load failed: ${result.error}")
            }
        }
    }

    /** Single-select, deselect on re-tap (matches the web). */
    fun toggleBudget(level: BudgetLevel) {
        budget = if (budget == level) null else level
        hasLoadedFromServer = true
        persistDraft()
    }

    fun toggleGender(value: Gender) {
        gender = if (gender == value) null else value
        hasLoadedFromServer = true
        persistDraft()
    }

    /** Multi-select. */
    fun toggleCuisine(item: String) {
        cuisines = if (item in cuisines) cuisines - item else cuisines + item
        hasLoadedFromServer = true
        persistDraft()
    }

    fun addPreference(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || trimmed in preferences || preferences.size >= 50) return
        preferences = preferences + trimmed
        hasLoadedFromServer = true
        persistDraft()
    }

    fun removePreference(pref: String) {
        preferences = preferences - pref
        hasLoadedFromServer = true
        persistDraft()
    }

    fun onDietaryChange(value: String) {
        dietary = value.take(200)
        hasLoadedFromServer = true
        persistDraft()
    }

    // Round-3 audit fix: mirrors the whole form into SavedStateHandle so it survives process
    // death (this screen has no confirm-before-leaving dialog, so a killed process previously
    // silently discarded the entire form, including a real server-loaded starting point). Once
    // this is called at all, a real draft worth restoring exists, so KEY_HAS_DRAFT is always
    // persisted true here (not tied to hasLoadedFromServer, which governs Save-gating only).
    private fun persistDraft() {
        savedStateHandle[KEY_HAS_DRAFT] = true
        savedStateHandle[KEY_BUDGET] = budget?.name
        savedStateHandle[KEY_GENDER] = gender?.name
        savedStateHandle[KEY_CUISINES] = ArrayList(cuisines)
        savedStateHandle[KEY_PREFS] = ArrayList(preferences)
        savedStateHandle[KEY_DIETARY] = dietary
    }

    fun save() {
        if (isSaving) return
        // Refuse to save a form we never successfully loaded — otherwise the unconditional backend
        // upsert would overwrite the user's real saved preferences with this form's defaults.
        if (!hasLoadedFromServer) {
            viewModelScope.launch {
                _events.send(PreferencesEvent.SaveFailed(stringProvider.get(R.string.preferences_error_not_loaded)))
            }
            return
        }
        isSaving = true
        viewModelScope.launch {
            // Gender lives in Supabase auth metadata (no /api/preferences field), saved the same way
            // the web does. Best-effort: a failure here is logged, not surfaced — the preferences
            // save below owns the user-facing Saved/SaveFailed result.
            gender?.let { g ->
                authRepository.updateGender(g.wire).onFailure { logger.e(TAG, "Save gender failed", it) }
            }
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
        const val KEY_HAS_DRAFT = "prefs_has_draft"
        const val KEY_BUDGET = "prefs_budget"
        const val KEY_GENDER = "prefs_gender"
        const val KEY_CUISINES = "prefs_cuisines"
        const val KEY_PREFS = "prefs_list"
        const val KEY_DIETARY = "prefs_dietary"
    }
}
