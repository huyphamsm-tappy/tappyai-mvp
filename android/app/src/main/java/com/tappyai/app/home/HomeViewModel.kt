package com.tappyai.app.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.history.Conversation
import com.tappyai.app.history.data.ChatHistoryRepository
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
    private val clock: ClockProvider,
    // No LanguageManager. Home deliberately does not consult the language store at all any more —
    // the caller passes the language Android's resource system already resolved, which is the only
    // way the greeting and the strings around it are guaranteed to agree.
    private val chatHistoryRepository: ChatHistoryRepository,
) : ViewModel() {

    /**
     * The hero greeting, for the language the CALLER is rendering in.
     *
     * 🚨 [english] is a parameter, and this is a function rather than the cached `val` it used to
     * be. Both of those are the fix for a real, device-reproduced defect, so please do not fold it
     * back into a property:
     *
     * It used to read `languageManager.current` once, in the constructor. Every other string on
     * this screen comes from a string resource, which Android re-resolves on a configuration
     * change — but below API 33 a language switch does NOT recreate the ViewModel. So after
     * switching language the hero rendered the new language's "Hi there 👋" eyebrow directly above
     * a greeting still in the old language, and stayed that way until the next force stop. The
     * caller passes `booleanResource(R.bool.resources_are_english)`, which is the same authority
     * that chose the surrounding strings, so the two can no longer disagree.
     *
     * Reading the clock here rather than in the constructor also means the greeting follows the
     * time of day within a long-lived session instead of being pinned to when Home was first built.
     */
    fun greeting(english: Boolean): String {
        val now = Instant.ofEpochMilli(clock.nowMillis()).atZone(ZoneId.systemDefault())
        return HomeGreeting.heroText(
            hour = now.hour,
            isWeekend = now.dayOfWeek == DayOfWeek.SATURDAY || now.dayOfWeek == DayOfWeek.SUNDAY,
            dayOfMonth = now.dayOfMonth,
            english = english,
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
