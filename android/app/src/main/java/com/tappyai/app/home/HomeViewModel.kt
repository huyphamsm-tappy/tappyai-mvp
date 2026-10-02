package com.tappyai.app.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.account.data.AccountRepository
import com.tappyai.app.deals.Deal
import com.tappyai.app.deals.data.DealsRepository
import com.tappyai.app.history.Conversation
import com.tappyai.app.history.data.ChatHistoryRepository
import com.tappyai.app.recommendations.Recommendation
import com.tappyai.app.recommendations.data.RecommendationsRepository
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewsRepository
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
 *  - [userName] backs the V3 hero greeting. It reuses the SAME [AccountRepository] the Profile and
 *    Account screens read, so Home adds no endpoint and no second identity source; a signed-out
 *    or failed load simply leaves it null and the greeting falls back to the generic form.
 *  - [recommendationsState] backs the "Gợi ý dành cho bạn" rail off the existing
 *    [RecommendationsRepository]. The [Recommendation] model carries placeId, placeName and
 *    matchedSignals only — no photo, rating or review count — so the rail renders just those.
 *  - [dealsState] backs the "Ưu đãi hôm nay" rail off the SAME daily pool the Deals screen reads
 *    ([DealsRepository.getDeals]). No new endpoint or field: the rail renders only what [Deal]
 *    already carries — see the section composable.
 *  - [communityVideosState] backs the "Video gợi ý cho bạn" rail: the SAME feed Explore already
 *    reads ([ReviewsRepository.getFeed]), narrowed to items that actually carry playable media.
 *    No new endpoint, DTO or table — the rail is a second view of an existing collection.
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
    private val reviewsRepository: ReviewsRepository,
    private val dealsRepository: DealsRepository,
    private val accountRepository: AccountRepository,
    private val recommendationsRepository: RecommendationsRepository,
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

    private val _communityVideosState = MutableStateFlow<UiState<List<Review>>>(UiState.Loading)
    val communityVideosState: StateFlow<UiState<List<Review>>> = _communityVideosState.asStateFlow()

    private val _dealsState = MutableStateFlow<UiState<List<Deal>>>(UiState.Loading)
    val dealsState: StateFlow<UiState<List<Deal>>> = _dealsState.asStateFlow()

    /** The signed-in user's display name, or null when unknown — never a placeholder. */
    private val _userName = MutableStateFlow<String?>(null)
    val userName: StateFlow<String?> = _userName.asStateFlow()

    private val _recommendationsState =
        MutableStateFlow<UiState<List<Recommendation>>>(UiState.Loading)
    val recommendationsState: StateFlow<UiState<List<Recommendation>>> =
        _recommendationsState.asStateFlow()

    init {
        loadRecent()
        loadCommunityVideos()
        loadDeals()
        loadUserName()
        loadRecommendations()
    }

    /**
     * Reads the display name from the existing account profile.
     *
     * Anything other than a successful load with a non-blank name leaves [userName] null, which
     * the hero renders as the generic greeting. No name is ever invented.
     */
    fun loadUserName() {
        viewModelScope.launch {
            val result = accountRepository.getProfile()
            _userName.value = (result as? NetworkResult.Success)
                ?.data?.fullName?.trim()?.takeIf { it.isNotEmpty() }
        }
    }

    /** Personalized place suggestions from the existing recommendations endpoint. */
    fun loadRecommendations() {
        _recommendationsState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = recommendationsRepository.getRecommendations()) {
                is NetworkResult.Success -> {
                    val items = result.data.items.take(RECOMMENDATIONS_LIMIT)
                    _recommendationsState.value =
                        if (items.isEmpty()) UiState.Empty else UiState.Success(items)
                }
                is NetworkResult.Error -> _recommendationsState.value = UiState.Empty
            }
        }
    }

    /**
     * Trending slice of the community feed, kept to the clips that can actually be shown.
     *
     * The filter uses only fields the model already declares: [ReviewContentType.Video] plus a
     * thumbnail or media url. Nothing is synthesised — an item with no media is dropped rather
     * than rendered as an empty card.
     */
    fun loadCommunityVideos() {
        _communityVideosState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = reviewsRepository.getFeed(page = 0, limit = VIDEO_FEED_PAGE, sort = VIDEO_FEED_SORT)) {
                is NetworkResult.Success -> {
                    val videos = result.data
                        .filter { it.contentType == ReviewContentType.Video }
                        .filter { !it.thumbnail.isNullOrBlank() || !it.mediaUrl.isNullOrBlank() }
                        .take(VIDEO_LIMIT)
                    _communityVideosState.value =
                        if (videos.isEmpty()) UiState.Empty else UiState.Success(videos)
                }
                // Same graceful stance the recent rail takes: a launchpad rail must never turn
                // Home into an error screen. The section simply does not render.
                is NetworkResult.Error -> _communityVideosState.value = UiState.Empty
            }
        }
    }

    /**
     * The top of the daily deal pool, for Home's rail.
     *
     * Reuses [DealsRepository] as-is; a failure resolves to [UiState.Empty] rather than an error,
     * because a partner-offer rail is not worth turning the launchpad into an error screen.
     */
    fun loadDeals() {
        _dealsState.value = UiState.Loading
        viewModelScope.launch {
            when (val result = dealsRepository.getDeals()) {
                is NetworkResult.Success -> {
                    val deals = result.data.take(DEALS_LIMIT)
                    _dealsState.value =
                        if (deals.isEmpty()) UiState.Empty else UiState.Success(deals)
                }
                is NetworkResult.Error -> _dealsState.value = UiState.Empty
            }
        }
    }

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
        const val DEALS_LIMIT = 6
        const val RECOMMENDATIONS_LIMIT = 8
        const val VIDEO_LIMIT = 8
        // Over-fetch a little: the page is mixed media, and only Video items survive the filter.
        const val VIDEO_FEED_PAGE = 20
        const val VIDEO_FEED_SORT = "trending"
    }
}
