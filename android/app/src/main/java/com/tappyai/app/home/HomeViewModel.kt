package com.tappyai.app.home

import androidx.lifecycle.ViewModel
import com.tappyai.app.R
import com.tappyai.core.common.ClockProvider
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.Instant
import java.time.ZoneId
import javax.inject.Inject

/**
 * State for the Home launchpad ([HomeScreen]). Phase 1C.1 scope is the UI skeleton only — no
 * network, no cross-feature business logic. So:
 *  - [greeting] is derived purely from the device clock ([ClockProvider], the existing test
 *    seam) — a local, offline computation, not a personalized server greeting.
 *  - [suggestionsState] and [recentActivityState] have **no data source yet** and honestly
 *    start [UiState.Empty]; the screen renders real empty/loading states off them (never fake
 *    data). When a later phase wires the AI-recommendation / history features, only this
 *    ViewModel changes — the screen already renders every state.
 */
@HiltViewModel
class HomeViewModel @Inject constructor(
    clock: ClockProvider,
    stringProvider: StringProvider,
) : ViewModel() {

    val greeting: String = greetingForHour(stringProvider, hourOfDay(clock.nowMillis()))

    private val _suggestionsState = MutableStateFlow<UiState<List<String>>>(UiState.Empty)
    val suggestionsState: StateFlow<UiState<List<String>>> = _suggestionsState.asStateFlow()

    private val _recentActivityState = MutableStateFlow<UiState<List<String>>>(UiState.Empty)
    val recentActivityState: StateFlow<UiState<List<String>>> = _recentActivityState.asStateFlow()

    private companion object {
        fun hourOfDay(millis: Long): Int =
            Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).hour

        fun greetingForHour(stringProvider: StringProvider, hour: Int): String = when (hour) {
            in 5..10 -> stringProvider.get(R.string.home_greeting_morning)
            in 11..16 -> stringProvider.get(R.string.home_greeting_afternoon)
            in 17..21 -> stringProvider.get(R.string.home_greeting_evening)
            else -> stringProvider.get(R.string.home_greeting_night)
        }
    }
}
