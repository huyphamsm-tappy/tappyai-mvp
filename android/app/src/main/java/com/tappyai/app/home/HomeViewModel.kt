package com.tappyai.app.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.R
import com.tappyai.app.account.AccountProfile
import com.tappyai.app.account.data.AccountRepository
import com.tappyai.core.common.ClockProvider
import com.tappyai.core.common.StringProvider
import com.tappyai.core.common.UiState
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.features.auth.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import javax.inject.Inject

/**
 * State for the Home launchpad ([HomeScreen]).
 *  - [greeting] is derived purely from the device clock ([ClockProvider], the existing test
 *    seam) — a local, offline computation, not a personalized server greeting.
 *  - [suggestionsState] is populated from `/api/suggested-prompts` (web parity — dynamic,
 *    time-of-day prompts): starts [UiState.Loading], resolves to Success or an honest Empty (never
 *    fake data). [recentActivityState] still has no source and stays [UiState.Empty].
 *  - [profile]/[isSignedIn]: Web-parity-sync fix — the web's `Header` shows the signed-in user's
 *    real avatar + first name next to the greeting (`src/components/Header.tsx:77-90`, `firstName
 *    = user?.full_name?.split(' ').pop() || user?.email?.split('@')[0] || 'bạn'`); this greeting
 *    previously ignored sign-in state entirely and Home's avatar was hardcoded to the neutral
 *    "not signed in" placeholder even for a signed-in user. Reuses the exact fetch pattern already
 *    proven in [com.tappyai.app.profile.ProfileViewModel].
 */
/** A Home "Suggested for you" prompt carrying BOTH language variants; the UI localizes it to the
 *  current app locale (see [SuggestionsSection]) rather than the system locale. */
data class HomeSuggestion(val text: String, val textEn: String)

@HiltViewModel
class HomeViewModel @Inject constructor(
    clock: ClockProvider,
    stringProvider: StringProvider,
    private val authRepository: AuthRepository,
    private val accountRepository: AccountRepository,
    private val suggestedPromptsApi: com.tappyai.app.home.data.SuggestedPromptsApi,
    private val logger: LoggerProvider,
) : ViewModel() {

    val greeting: String = greetingForHour(stringProvider, hourOfDay(clock.nowMillis()))

    /** The device-clock hour (0–23), locale-independent. The hero greeting string is resolved in
     *  the Composable from this via `stringResource`, so it re-localizes on a runtime language
     *  switch — unlike [greeting], a `val` fixed to the locale at ViewModel construction. */
    val heroHour: Int = hourOfDay(clock.nowMillis())

    var isSignedIn by mutableStateOf(false)
        private set

    var profile by mutableStateOf<AccountProfile?>(null)
        private set

    /** Matches web's `firstName` fallback chain exactly (`Header.tsx:20`) — including its literal,
     *  non-localized `"bạn"` last resort, only ever reached when both full name and email are
     *  blank (in practice, effectively never, since Supabase always supplies an email). */
    val greetingName: String?
        get() = profile?.let { p ->
            p.fullName.trim().split(" ").lastOrNull { it.isNotBlank() }
                ?: p.email.substringBefore("@").ifBlank { null }
                ?: "bạn"
        }

    private val _suggestionsState = MutableStateFlow<UiState<List<HomeSuggestion>>>(UiState.Empty)
    val suggestionsState: StateFlow<UiState<List<HomeSuggestion>>> = _suggestionsState.asStateFlow()

    private val _recentActivityState = MutableStateFlow<UiState<List<String>>>(UiState.Empty)
    val recentActivityState: StateFlow<UiState<List<String>>> = _recentActivityState.asStateFlow()

    init {
        viewModelScope.launch {
            isSignedIn = withContext(Dispatchers.IO) { authRepository.currentUserId() } != null
            if (isSignedIn) {
                when (val result = accountRepository.getProfile()) {
                    is NetworkResult.Success -> profile = result.data
                    is NetworkResult.Error -> logger.e(TAG, "Home identity load failed: ${result.error}")
                }
            }
        }
        loadSuggestedPrompts()
    }

    /** Populate the Home "Ask Tappy" suggestion chips from /api/suggested-prompts (web parity — was
     *  an unwired empty state). Honest empty on any failure; picks the locale-appropriate text. */
    private fun loadSuggestedPrompts() {
        _suggestionsState.value = UiState.Loading
        viewModelScope.launch {
            // Keep BOTH languages; the Composable localizes to the CURRENT APP locale (not the
            // system locale, and re-picking on a runtime VI/EN switch without a re-fetch). Fixing
            // it here with Locale.getDefault() would still read the system locale and never update.
            val prompts = runCatching { suggestedPromptsApi.getSuggestedPrompts() }
                .onFailure { logger.e(TAG, "Suggested prompts load failed: ${it.message}") }
                .getOrNull()
                ?.prompts
                ?.map { HomeSuggestion(text = it.text.trim(), textEn = it.textEn.trim()) }
                ?.filter { it.text.isNotEmpty() || it.textEn.isNotEmpty() }
                .orEmpty()
            _suggestionsState.value = if (prompts.isEmpty()) UiState.Empty else UiState.Success(prompts)
        }
    }

    private companion object {
        const val TAG = "HomeViewModel"

        fun hourOfDay(millis: Long): Int =
            Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).hour

        // Web parity (components/Header.tsx:30): exactly 3 buckets, no "night" —
        // hour < 12 → morning, < 18 → afternoon, else → evening. The old 4-bucket boundaries
        // disagreed with the web at 00–04 (web evening), 17:00 (web afternoon) and 22–23 (web evening).
        fun greetingForHour(stringProvider: StringProvider, hour: Int): String = when {
            hour < 12 -> stringProvider.get(R.string.home_greeting_morning)
            hour < 18 -> stringProvider.get(R.string.home_greeting_afternoon)
            else -> stringProvider.get(R.string.home_greeting_evening)
        }
    }
}
