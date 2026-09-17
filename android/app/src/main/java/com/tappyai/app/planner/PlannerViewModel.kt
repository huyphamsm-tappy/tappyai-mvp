package com.tappyai.app.planner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.history.data.ChatHistoryErrorMessages
import com.tappyai.app.history.data.ChatHistoryRepository
import com.tappyai.core.common.ClockProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * AI Planner (My Plans) — the web `/planner` page, native. NO NEW TABLE, NO NEW API, NO NEW
 * WRITE PATH: plans are read out of the user's own conversations (`GET /api/conversations`,
 * the same read History and Chat resume use) and turned into cards by [DerivePlans].
 *
 * The backend caps that read at 20 rows (the web page scans 40 through its server-side
 * Supabase client); `planner_scope` tells the user the list comes from recent conversations,
 * exactly as the web's `v3.planner.scope` does.
 */
@HiltViewModel
class PlannerViewModel @Inject constructor(
    clock: ClockProvider,
    private val repository: ChatHistoryRepository,
    private val errorMessages: ChatHistoryErrorMessages,
    private val logger: LoggerProvider,
) : ViewModel() {

    val now: Long = clock.nowMillis()

    private val _uiState = MutableStateFlow<UiState<List<DerivedPlan>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<DerivedPlan>>> = _uiState.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        loadJob?.cancel()
        _uiState.value = UiState.Loading
        loadJob = viewModelScope.launch {
            _uiState.value = when (val result = repository.getConversationsWithMessages()) {
                is NetworkResult.Success -> {
                    val plans = DerivePlans.derivePlans(result.data)
                    if (plans.isEmpty()) UiState.Empty else UiState.Success(plans)
                }
                is NetworkResult.Error -> {
                    logger.e(TAG, "Planner load failed: ${result.error}")
                    UiState.Error(errorMessages.toUserMessage(result.error))
                }
            }
        }
    }

    private companion object {
        const val TAG = "PlannerViewModel"
    }
}
