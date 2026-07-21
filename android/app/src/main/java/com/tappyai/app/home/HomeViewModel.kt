package com.tappyai.app.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.history.Conversation
import com.tappyai.app.history.data.ChatHistoryRepository
import com.tappyai.app.language.AppLanguage
import com.tappyai.app.language.LanguageManager
import com.tappyai.core.common.ClockProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.network.NetworkResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import javax.inject.Inject

/**
 * State for the Home launchpad ([HomeScreen]).
 *  - [greeting] comes from [HomeGreeting] — the exact web hero engine (7 local-time slots ×
 *    multiple templates × weekday/weekend variants, template = dayOfMonth % pool). Local, offline
 *    computation from the device clock ([ClockProvider]); never a single hardcoded string.
 *  - [recentActivityState] surfaces the user's recent conversations (web parity: HomeView's
 *    "Recent conversations" — GET conversations, newest first, capped at 5), starting
 *    [UiState.Loading] then resolving to real rows or an honest empty state.
 *
 * The Suggestions section renders a static curated prompt set directly in the screen (UI-parity
 * only, no personalization engine — see `HOME_SUGGESTIONS`), so it needs no ViewModel state.
 */
@HiltViewModel
class HomeViewModel @Inject constructor(
    clock: ClockProvider,
    languageManager: LanguageManager,
    private val chatHistoryRepository: ChatHistoryRepository,
) : ViewModel() {

    val greeting: String = run {
        val now = Instant.ofEpochMilli(clock.nowMillis()).atZone(ZoneId.systemDefault())
        HomeGreeting.heroText(
            hour = now.hour,
            isWeekend = now.dayOfWeek == DayOfWeek.SATURDAY || now.dayOfWeek == DayOfWeek.SUNDAY,
            dayOfMonth = now.dayOfMonth,
            english = languageManager.current == AppLanguage.English,
        )
    }

    private val _recentActivityState = MutableStateFlow<UiState<List<Conversation>>>(UiState.Loading)
    val recentActivityState: StateFlow<UiState<List<Conversation>>> = _recentActivityState.asStateFlow()

    init { loadRecent() }

    fun loadRecent() {
        _recentActivityState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = chatHistoryRepository.getConversations()) {
                is NetworkResult.Success -> {
                    val recent = result.data.take(RECENT_LIMIT)
                    _recentActivityState.value =
                        if (recent.isEmpty()) UiState.Empty else UiState.Success(recent)
                }
                // Home stays graceful on a transient failure — fall back to the empty-chat state
                // rather than a full error screen (the section is a launchpad convenience, not core).
                is NetworkResult.Error -> _recentActivityState.value = UiState.Empty
            }
        }
    }

    private companion object {
        const val RECENT_LIMIT = 5
    }
}
