package com.tappyai.app.home

import androidx.annotation.StringRes
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.CurrencyExchange
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.history.Conversation
import com.tappyai.app.history.emojiForCategory
import com.tappyai.app.history.formatRelativeTime
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyAvatar
import com.tappyai.core.designsystem.component.TappyAvatarSize
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * The Home tab's launchpad (Phase 1C.1 — full UI skeleton, no network, no cross-feature
 * business logic). Mirrors the web Home's structure at MVP fidelity, but every data-driven
 * section renders its **real** state off [HomeViewModel] (currently [UiState.Empty]) rather than
 * mock content — so later phases only connect data. Navigation targets are honest too: tiles
 * that map to an existing shell tab switch to it via [onNavigateToTab]; features with no screen
 * yet surface a "coming soon" message instead of a dead link.
 *
 * Lives in `:app` (not a `features:home` module) per the approved Phase 1C.1 decision — the
 * shell and its tab content are composition-root concerns until real feature modules exist.
 */
@Composable
fun HomeScreen(
    onNavigateToTab: (HomeTab) -> Unit,
    onOpenChatWithCategory: (String) -> Unit,
    onOpenChatWithPrefill: (String) -> Unit,
    onOpenConversation: (String) -> Unit,
    onOpenMusic: () -> Unit,
    onOpenRecommendations: () -> Unit,
    onOpenTarot: () -> Unit,
    onOpenTuVi: () -> Unit,
    onOpenZodiac: () -> Unit,
    onOpenTranslate: () -> Unit,
    onOpenCurrency: () -> Unit,
    onOpenDeals: () -> Unit,
    onOpenGames: () -> Unit,
    onOpenScan: () -> Unit,
    onOpenVietWriter: () -> Unit,
    onOpenTappyTogether: () -> Unit,
    onOpenSplitBill: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val recentActivity by viewModel.recentActivityState.collectAsStateWithLifecycle()

    // The feature whose "coming soon" sheet is open (null = closed). A single shared sheet for
    // every unfinished quick action, rather than one snackbar per tap.

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .padding(TappySpacing.xl),
            // Web parity: section vertical rhythm is space-y-6 = 24px.
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xxxl),
        ) {
            // Section order mirrors the web Home (HomeView.tsx): hero (gradient card w/ greeting +
            // embedded search) → categories → fortune → scan → Tappy Together → recommendations+
            // music → tools → content writer → suggestions → recent.
            HomeHero(greeting = viewModel.greeting, onOpenChat = { onNavigateToTab(HomeTab.Chat) })
            CategoryChipsSection(onOpenCategory = onOpenChatWithCategory)
            FortuneSection(
                onOpenTarot = onOpenTarot,
                onOpenTuVi = onOpenTuVi,
                onOpenZodiac = onOpenZodiac,
            )
            ScanSection(onOpenScan = onOpenScan)
            TappyTogetherSection(onOpenTappyTogether = onOpenTappyTogether)
            RecommendationsAndMusicSection(
                onOpenRecommendations = onOpenRecommendations,
                onOpenMusic = onOpenMusic,
            )
            ToolsSection(
                onOpenCurrency = onOpenCurrency,
                onOpenTranslate = onOpenTranslate,
                onOpenGames = onOpenGames,
                onOpenSplitBill = onOpenSplitBill,
            )
            ContentWriterSection(onOpenVietWriter = onOpenVietWriter)
            SuggestionsSection(onOpenChatWithPrefill = onOpenChatWithPrefill)
            RecentActivitySection(state = recentActivity, onOpenConversation = onOpenConversation)
        }
    }

}

// Web hero palette (tailwind primary-500/600, accent-500/300 — the exact hero gradient stops).
private val HeroPrimary500 = Color(0xFF007AFF)
private val HeroPrimary600 = Color(0xFF0062CC)
private val HeroAccent500 = Color(0xFFFF9500)
private val HeroAccent300 = Color(0xFFFFBD66)
private val Primary400 = Color(0xFF3391FF)

@Composable
private fun HomeHero(greeting: String, onOpenChat: () -> Unit) {
    // Web parity: rounded-3xl (24) gradient banner `from-primary-500 via-primary-600 to-accent-500`
    // (to bottom-right), shadow-lg, two decorative blobs, an eyebrow greeting + a black heading, and
    // the embedded search box (<SearchBar variant="hero">).
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(elevation = 16.dp, shape = RoundedCornerShape(24.dp), spotColor = HeroPrimary500, ambientColor = HeroPrimary500)
            .clip(RoundedCornerShape(24.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(HeroPrimary500, HeroPrimary600, HeroAccent500),
                    start = Offset.Zero,
                    end = Offset.Infinite, // → bottom-right (135°)
                ),
            ),
    ) {
        // Decorative blobs (pointer-events-none): white/10 top-right, accent-300/20 blurred bottom-left.
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = 56.dp, y = (-56).dp)
                .size(192.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.1f)),
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .offset(x = (-40).dp, y = 64.dp)
                .size(160.dp)
                .blur(40.dp)
                .clip(CircleShape)
                .background(HeroAccent300.copy(alpha = 0.2f)),
        )
        Column(modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 24.dp, bottom = 28.dp)) {
            Text(
                text = stringResource(R.string.home_hero_greeting_sub),
                fontSize = 14.sp, // text-sm
                fontWeight = FontWeight.Medium,
                color = Color.White.copy(alpha = 0.8f),
                modifier = Modifier.padding(bottom = 4.dp), // mb-1
            )
            Text(
                text = greeting,
                fontSize = 24.sp, // text-2xl
                lineHeight = 30.sp, // leading-tight
                fontWeight = FontWeight.Black, // font-black (900)
                color = Color.White,
                modifier = Modifier.padding(bottom = 20.dp), // mb-5
            )
            HeroSearchBar(onClick = onOpenChat)
        }
    }
}

@Composable
private fun HeroSearchBar(onClick: () -> Unit) {
    // Web <SearchBar variant="hero">: white rounded-2xl input, shadow-lg, Sparkles leading icon
    // (primary-400), static placeholder, primary submit button. Tapping opens Chat (the web submits
    // to /chat?q=…). Kept as a tap target rather than an inline field — the composer lives in Chat.
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(elevation = 8.dp, shape = RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.xl), // py-4 = 16px
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.AutoAwesome, // lucide Sparkles
            contentDescription = null,
            tint = Primary400,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = stringResource(R.string.home_hero_search_placeholder),
            style = MaterialTheme.typography.bodyLarge, // 16px
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            modifier = Modifier.weight(1f),
        )
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.ArrowUpward,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

private data class HomeCategory(val id: String, val emoji: String, val labelRes: Int)

// Mirrors the web home's CategoryPills (components/CategoryPills.tsx + CATEGORIES in lib/utils.ts):
// the same five content categories, in the same order, rendered as a horizontally-scrolling pill
// row directly under the ask box. Tapping one opens the Chat tab scoped to that category — the
// native equivalent of the web's `/chat?category=<id>` (HomeRoute.Chat already carries `category`).
private val HOME_CATEGORIES = listOf(
    HomeCategory("food", "🍜", R.string.home_category_food),
    HomeCategory("shopping", "🛍️", R.string.home_category_shopping),
    HomeCategory("entertainment", "🎭", R.string.home_category_entertainment),
    HomeCategory("travel", "✈️", R.string.home_category_travel),
    HomeCategory("spa", "💆", R.string.home_category_spa),
)

private data class HomeSuggestion(@StringRes val textRes: Int, val category: String, val emoji: String)

// Curated prompt cards mirroring web HomeView's Suggestions section. UI parity ONLY — a fixed
// subset of the web WITTY_PROMPTS pool, deliberately NOT the personalization engine (owner: no new
// features). Tapping opens Chat pre-filled with the prompt, like the web `/chat?q=…` link.
private val HOME_SUGGESTIONS = listOf(
    HomeSuggestion(R.string.home_suggestion_1, "food", "🍜"),
    HomeSuggestion(R.string.home_suggestion_2, "entertainment", "🎁"),
    HomeSuggestion(R.string.home_suggestion_3, "food", "🍜"),
    HomeSuggestion(R.string.home_suggestion_4, "travel", "✈️"),
    HomeSuggestion(R.string.home_suggestion_5, "shopping", "🛍️"),
    HomeSuggestion(R.string.home_suggestion_6, "entertainment", "🎮"),
)

// Discoverability fix (2026-07-20): the pill strip used to be a single horizontalScroll Row, so on a
// phone the trailing categories (esp. "Spa & Beauty") scrolled off-screen with only a right-edge
// fade as a hint. Web shows all five at once — CategoryPills wraps on `sm+` (`sm:flex-wrap`). Mirror
// that with a FlowRow so every category is always visible, and add the web's "Explore by category"
// section header (HomeView's Sparkles + `home.exploreByCategory`).
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategoryChipsSection(onOpenCategory: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) { // mb-3 = 12px
        SectionHeader(title = stringResource(R.string.home_section_explore_by_category), showSparkle = true)
        // Web CategoryPills scroll on mobile / wrap on sm+; kept as a wrap (owner discoverability
        // decision 2026-07-20 so all 5 are always visible) with the exact web pill styling.
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), // gap-2 = 8px
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            HOME_CATEGORIES.forEach { category ->
                CategoryPill(
                    emoji = category.emoji,
                    label = stringResource(category.labelRes),
                    onClick = { onOpenCategory(category.id) },
                )
            }
        }
    }
}

/** Web CategoryPills pill: white rounded-full, 1px gray border, shadow-sm, px-4 py-2.5, 14sp/500. */
@Composable
private fun CategoryPill(emoji: String, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .shadow(2.dp, CircleShape)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp), // px-4 py-2.5
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), // gap-1.5 = 6px
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = emoji, fontSize = 16.sp) // text-base
        Text(
            text = label,
            fontSize = 14.sp, // text-sm
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun SuggestionsSection(onOpenChatWithPrefill: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_section_suggested))
        // 2-column grid of curated prompt cards (web HomeView Suggestions). UI parity only.
        HOME_SUGGESTIONS.chunked(2).forEach { pair ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                pair.forEach { suggestion ->
                    SuggestionCard(
                        suggestion = suggestion,
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        onClick = onOpenChatWithPrefill,
                    )
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun SuggestionCard(suggestion: HomeSuggestion, modifier: Modifier, onClick: (String) -> Unit) {
    val text = stringResource(suggestion.textRes)
    TappyCard(
        modifier = modifier
            .clip(TappyShapes.card)
            .clickable { onClick(text) },
        contentPadding = PaddingValues(0.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp) // web h-16
                    .background(suggestionGradient(suggestion.category)),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = suggestion.emoji, fontSize = 30.sp) // web text-3xl
            }
            Text(
                text = text,
                modifier = Modifier.padding(TappySpacing.lg), // web p-3 = 12px
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2, // web line-clamp-2
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Category → light gradient, mirroring the web DEFAULT_GRADIENT tints for the suggestion header. */
private fun suggestionGradient(category: String): Brush = when (category) {
    "food" -> Brush.verticalGradient(listOf(Color(0xFFFFEDD5), Color(0xFFFFF7ED)))
    "shopping" -> Brush.verticalGradient(listOf(Color(0xFFFCE7F3), Color(0xFFFDF2F8)))
    "entertainment" -> Brush.verticalGradient(listOf(Color(0xFFF3E8FF), Color(0xFFFAF5FF)))
    "travel" -> Brush.verticalGradient(listOf(Color(0xFFDBEAFE), Color(0xFFEFF6FF)))
    "spa" -> Brush.verticalGradient(listOf(Color(0xFFDCFCE7), Color(0xFFF0FDF4)))
    else -> Brush.verticalGradient(listOf(Color(0xFFF3F4F6), Color(0xFFF9FAFB)))
}

@Composable
private fun RecentActivitySection(
    state: UiState<List<Conversation>>,
    onOpenConversation: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_section_recent_activity))
        when (state) {
            UiState.Loading -> LoadingBlock()
            is UiState.Success -> {
                // A single "now" per composition so every row's relative time is consistent.
                val nowMillis = remember { System.currentTimeMillis() }
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    state.data.forEach { conv ->
                        RecentConversationRow(
                            conversation = conv,
                            nowMillis = nowMillis,
                            onClick = { onOpenConversation(conv.id) },
                        )
                    }
                }
            }
            // Empty / Error / Idle → the honest empty-chat state (web parity: user with no
            // conversations sees the empty prompt, not a fabricated list).
            else -> TappyEmptyState(
                icon = Icons.Filled.History,
                title = stringResource(R.string.home_empty_recent_title),
                message = stringResource(R.string.home_empty_recent_message),
            )
        }
    }
}

@Composable
private fun RecentConversationRow(conversation: Conversation, nowMillis: Long, onClick: () -> Unit) {
    TappyCard(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Web parity: a 40px rounded-xl gray tile with a MessageCircle icon in primary-400
            // (not the conversation's category emoji).
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Chat,
                    contentDescription = null,
                    tint = Primary400,
                    modifier = Modifier.size(18.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = conversation.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = stringResource(R.string.home_recent_message_count, conversation.messageCount) +
                        " · " + formatRelativeTime(conversation.updatedAtMillis, nowMillis),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private data class FortuneEntry(val emoji: String, val title: String, val description: String, val onClick: () -> Unit)

@Composable
private fun FortuneSection(
    onOpenTarot: () -> Unit,
    onOpenTuVi: () -> Unit,
    onOpenZodiac: () -> Unit,
) {
    val entries = listOf(
        FortuneEntry(
            "🔮",
            stringResource(R.string.home_fortune_tarot_title),
            stringResource(R.string.home_fortune_tarot_description),
            onOpenTarot,
        ),
        FortuneEntry(
            "🧧",
            stringResource(R.string.home_fortune_horoscope_title),
            stringResource(R.string.home_fortune_horoscope_description),
            onOpenTuVi,
        ),
        FortuneEntry(
            "✨",
            stringResource(R.string.home_fortune_zodiac_title),
            stringResource(R.string.home_fortune_zodiac_description),
            onOpenZodiac,
        ),
    )

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_section_fortune))
        // 3-column grid of emoji + label tiles, mirroring web HomeView's Fortune `grid-cols-3`
        // (was a vertical list of description rows).
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            entries.forEach { entry ->
                TappyCard(
                    modifier = Modifier
                        .weight(1f)
                        .clip(TappyShapes.card)
                        .clickable(onClick = entry.onClick),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = TappySpacing.xs),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    ) {
                        Text(text = entry.emoji, fontSize = 24.sp) // web text-2xl
                        Text(
                            text = entry.title,
                            fontSize = 12.sp, // web text-xs
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/** Web parity: the Home "For you" (Recommendations) + "Music library" pair — a 2-column grid, as
 *  in HomeView.tsx's Recommendations+Music section. Each tile opens its screen (already wired in
 *  HomeTabHost). */
@Composable
private fun RecommendationsAndMusicSection(
    onOpenRecommendations: () -> Unit,
    onOpenMusic: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        FeatureTile(
            title = stringResource(R.string.home_recommendations_card_title),
            description = stringResource(R.string.home_recommendations_card_desc),
            onClick = onOpenRecommendations,
            iconGradient = GradPrimaryAccent,
            icon = { Icon(Icons.Filled.AutoAwesome, null, tint = Color(0xFF0062CC), modifier = Modifier.size(20.dp)) },
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
        )
        FeatureTile(
            title = stringResource(R.string.home_music_title),
            description = stringResource(R.string.home_music_desc),
            onClick = onOpenMusic,
            iconGradient = GradPinkOrange,
            icon = { Icon(Icons.Filled.MusicNote, null, tint = Color(0xFFDB2777), modifier = Modifier.size(20.dp)) },
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
        )
    }
}

/** Web parity: the Home "Scan documents" section (HomeView.tsx §Scan) — a featured card opening the
 *  scan flow (📷 Chụp ảnh → AI trích xuất văn bản). */
@Composable
private fun ScanSection(onOpenScan: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        SectionHeader(
            title = stringResource(R.string.home_scan_title),
            action = { SectionLink(stringResource(R.string.home_action_open), onOpenScan) },
        )
        FeaturedCard(
            emoji = "📷",
            title = stringResource(R.string.home_scan_card_title),
            description = stringResource(R.string.home_scan_card_desc),
            onClick = onOpenScan,
            // Web: from-teal-100 to-cyan-100
            iconGradient = Brush.linearGradient(listOf(Color(0xFFCCFBF1), Color(0xFFCFFAFE))),
            // Web card tint: from-teal-500/15 to-cyan-400/5
            cardTint = Brush.linearGradient(
                listOf(Color(0xFF14B8A6).copy(alpha = 0.15f), Color(0xFF22D3EE).copy(alpha = 0.05f)),
            ),
        )
    }
}

/** Web parity: the Home "Tappy Together" section (HomeView.tsx §Tappy Together) — a headerless
 *  featured card opening the group-create flow (web `/group/new`). */
@Composable
private fun TappyTogetherSection(onOpenTappyTogether: () -> Unit) {
    FeaturedCard(
        emoji = "👥",
        title = stringResource(R.string.home_together_title),
        description = stringResource(R.string.home_together_desc),
        onClick = onOpenTappyTogether,
        // Web: from-violet-100 to-pink-100
        iconGradient = Brush.linearGradient(listOf(Color(0xFFEDE9FE), Color(0xFFFCE7F3))),
        // Web card tint: from-violet-500/15 to-pink-400/5
        cardTint = Brush.linearGradient(
            listOf(Color(0xFF8B5CF6).copy(alpha = 0.15f), Color(0xFFF472B6).copy(alpha = 0.05f)),
        ),
    )
}

/** Web parity: the Home "Handy tools" 2×2 grid (HomeView.tsx §Tools) — Currency, Split bill,
 *  Translate, Games, in the web's order. */
@Composable
private fun ToolsSection(
    onOpenCurrency: () -> Unit,
    onOpenTranslate: () -> Unit,
    onOpenGames: () -> Unit,
    onOpenSplitBill: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_tools_title))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            FeatureTile(
                title = stringResource(R.string.home_currency_title),
                description = stringResource(R.string.home_currency_desc),
                onClick = onOpenCurrency,
                iconGradient = GradEmeraldTeal,
                icon = { Icon(Icons.Filled.CurrencyExchange, null, tint = Color(0xFF059669), modifier = Modifier.size(20.dp)) },
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            )
            FeatureTile(
                title = stringResource(R.string.home_split_title),
                description = stringResource(R.string.home_split_desc),
                onClick = onOpenSplitBill,
                iconGradient = GradVioletPurple,
                icon = { Icon(Icons.Filled.Calculate, null, tint = Color(0xFF7C3AED), modifier = Modifier.size(20.dp)) },
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            FeatureTile(
                title = stringResource(R.string.home_translate_title),
                description = stringResource(R.string.home_translate_desc),
                onClick = onOpenTranslate,
                iconGradient = GradBlueSky,
                icon = { Text("🌐", fontSize = 20.sp) },
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            )
            FeatureTile(
                title = stringResource(R.string.home_games_title),
                description = stringResource(R.string.home_games_desc),
                onClick = onOpenGames,
                iconGradient = GradOrangeAmber,
                icon = { Text("🎮", fontSize = 20.sp) },
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            )
        }
    }
}

/** A compact vertical grid tile (title + description) used by the 2-column Recommendations+Music
 *  and Tools grids. The leading emoji is embedded in the title string, matching the web labels. */
@Composable
private fun FeatureTile(
    title: String,
    description: String,
    onClick: () -> Unit,
    iconGradient: Brush,
    modifier: Modifier = Modifier,
    icon: @Composable () -> Unit,
) {
    TappyCard(
        modifier = modifier
            .clip(TappyShapes.card)
            .clickable(onClick = onClick),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) { // web gap-3 = 12px
            // Web: per-feature colored gradient icon chip — w-11 h-11 rounded-xl bg-gradient-to-br.
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(iconGradient),
                contentAlignment = Alignment.Center,
            ) { icon() }
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// Web tailwind-100 gradient pairs + 600 icon tints for the Home feature-card icon chips.
private fun featureGradient(a: Long, b: Long) = Brush.linearGradient(listOf(Color(a), Color(b)))
private val GradEmeraldTeal = featureGradient(0xFFD1FAE5, 0xFFCCFBF1)
private val GradVioletPurple = featureGradient(0xFFEDE9FE, 0xFFF3E8FF)
private val GradBlueSky = featureGradient(0xFFDBEAFE, 0xFFE0F2FE)
private val GradOrangeAmber = featureGradient(0xFFFFEDD5, 0xFFFEF3C7)
private val GradPrimaryAccent = featureGradient(0xFFCCE3FF, 0xFFFFE9CC)
private val GradPinkOrange = featureGradient(0xFFFCE7F3, 0xFFFFEDD5)

/** The full-width featured card idiom used by Home's Scan / Tappy Together sections: leading emoji,
 *  title + description, trailing chevron (same shape as [ContentWriterSection]'s card). */
@Composable
private fun FeaturedCard(
    emoji: String,
    title: String,
    description: String,
    onClick: () -> Unit,
    iconGradient: Brush? = null,
    cardTint: Brush? = null,
) {
    // contentPadding=0 so an optional card-level gradient tint (web `bg-gradient-to-br from-X/15
    // to-Y/5`) can fill the whole card; the padding moves onto the tinted Row.
    TappyCard(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .clickable(onClick = onClick),
        contentPadding = PaddingValues(0.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .then(if (cardTint != null) Modifier.background(cardTint) else Modifier)
                .padding(TappySpacing.xl), // web p-4 = 16px
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.xl), // web gap-4 = 16px
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Web: colored gradient icon tile (w-14 h-14 rounded-2xl bg-gradient-to-br from-X-100…).
            if (iconGradient != null) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(iconGradient),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = emoji, fontSize = 26.sp)
                }
            } else {
                Text(text = emoji, style = MaterialTheme.typography.headlineSmall)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** A single featured card, mirroring the web's "Content writer" Home section (`✍️` icon, title,
 *  description, chevron) — not a quick-action tile, since the web places this as its own section
 *  rather than in the quick-actions grid. */
@Composable
private fun ContentWriterSection(onOpenVietWriter: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        SectionHeader(
            title = stringResource(R.string.home_content_writer_title),
            action = { SectionLink(stringResource(R.string.home_action_open), onOpenVietWriter) },
        )
        TappyCard(
            modifier = Modifier
                .fillMaxWidth()
                .clip(TappyShapes.card)
                .clickable(onClick = onOpenVietWriter),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = "✍️", style = MaterialTheme.typography.headlineSmall)
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.home_content_writer_card_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(R.string.home_content_writer_card_desc),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SectionHeader(
    title: String,
    showSparkle: Boolean = false,
    action: (@Composable () -> Unit)? = null,
) {
    // Web: `font-semibold text-gray-900 mb-3`, with an optional trailing primary "See all"/"Open"
    // link; the category header additionally leads with a Sparkles icon in accent-500.
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), // gap-2
    ) {
        if (showSparkle) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = HeroAccent500, // accent-500 #FF9500
                modifier = Modifier.size(16.dp),
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        action?.invoke()
    }
}

/** Web section "See all"/"Open" trailing link: `text-sm text-primary-500 font-medium`. */
@Composable
private fun SectionLink(text: String, onClick: () -> Unit) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.Medium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.sm, vertical = TappySpacing.xs),
    )
}

@Composable
private fun LoadingBlock() {
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center,
    ) {
        TappyLoadingIndicator()
    }
}

private const val COLUMNS = 4

private const val PROMPT_ROTATION_MS = 3000L
