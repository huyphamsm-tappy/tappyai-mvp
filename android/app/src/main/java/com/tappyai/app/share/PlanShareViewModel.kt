package com.tappyai.app.share

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The share sheet's plan link, as state the sheet can draw.
 *
 * Hoisted into a ViewModel so a configuration change mid-publish keeps the in-flight request
 * and its answer. One publish per plan block: the sheet asks for `planJson` when it opens on a
 * plan, and asks again only for a different block (or a retry).
 */
sealed class PlanShareState {
    data object Idle : PlanShareState()
    /** "Đang tạo kế hoạch chia sẻ…" — no target may fire yet. */
    data object Preparing : PlanShareState()
    data class Ready(val link: PlanShareOutcome.Link) : PlanShareState()
    /** A truthful reason there is no link. The sheet never falls back to the text brochure. */
    data class Failed(val outcome: PlanShareOutcome) : PlanShareState()
}

@HiltViewModel
class PlanShareViewModel @Inject constructor(
    private val repository: PlanShareRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<PlanShareState>(PlanShareState.Idle)
    val state: StateFlow<PlanShareState> = _state

    private var current: String? = null
    private var job: Job? = null

    /** Publish this block unless it is already published or in flight. */
    fun publish(planJson: String?) {
        if (planJson == current && _state.value !is PlanShareState.Failed) return
        current = planJson
        job?.cancel()
        if (planJson.isNullOrBlank()) {
            _state.value = PlanShareState.Failed(PlanShareOutcome.NoPlanPayload)
            return
        }
        _state.value = PlanShareState.Preparing
        job = viewModelScope.launch {
            _state.value = when (val outcome = repository.publish(planJson)) {
                is PlanShareOutcome.Link -> PlanShareState.Ready(outcome)
                else -> PlanShareState.Failed(outcome)
            }
        }
    }

    /** Try the same block again after a failure. */
    fun retry() {
        val block = current ?: return
        _state.value = PlanShareState.Idle
        current = null
        publish(block)
    }

    /** The sheet closed: forget the block so the next open publishes afresh (the server dedupes). */
    fun reset() {
        job?.cancel()
        current = null
        _state.value = PlanShareState.Idle
    }
}
