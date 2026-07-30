package com.tappyai.app.home

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CurrencyExchange
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Calculate
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
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
    onOpenSplitBill: () -> Unit,
    onOpenChatWithPrefill: (String) -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val suggestions by viewModel.suggestionsState.collectAsStateWithLifecycle()
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
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            // Web parity (HomeView.tsx): gradient hero card (greeting + search) → Categories →
            // Fortune → Recommendations → tools grid → Content → Suggestions → Recent. The 9-tile
            // QuickActions grid is Android's one intentional divergence (approved), sitting where
            // web's 2-col "Tools" section does (after Recommendations).
            HomeHeroCard(
                greeting = viewModel.greeting,
                greetingName = viewModel.greetingName,
                avatarUrl = viewModel.profile?.avatarUrl,
                onOpenChat = { onNavigateToTab(HomeTab.Chat) },
            )
            CategorySection(onOpenCategory = { onNavigateToTab(HomeTab.Chat) })
            FortuneSection(
                onOpenTarot = onOpenTarot,
                onOpenTuVi = onOpenTuVi,
                onOpenZodiac = onOpenZodiac,
            )
            RecommendationsSection(onOpenRecommendations = onOpenRecommendations)
            QuickActionsSection(
                onNavigateToTab = onNavigateToTab,
                onOpenMusic = onOpenMusic,
                onOpenTranslate = onOpenTranslate,
                onOpenCurrency = onOpenCurrency,
                onOpenDeals = onOpenDeals,
                onOpenGames = onOpenGames,
                onOpenScan = onOpenScan,
                onOpenSplitBill = onOpenSplitBill,
            )
            ContentWriterSection(onOpenVietWriter = onOpenVietWriter)
            SuggestionsSection(state = suggestions, onSuggestionClick = onOpenChatWithPrefill)
            RecentActivitySection(state = recentActivity)
        }
    }

}

@Composable
private fun HomeHeroCard(
    greeting: String,
    greetingName: String?,
    avatarUrl: String?,
    onOpenChat: () -> Unit,
) {
    // Web parity (HomeView.tsx hero): a rounded gradient card holding the greeting, a location
    // affordance, and the "ask Tappy" search entry — replacing Android's older plain greeting row +
    // separate search card. Web's big rotating heroText is a server-computed field (heroTextVi) that
    // Android has no data source for, so the greeting stands in as the card's prominent line.
    //
    // The prompt rotation is purely presentational — a deterministic timer over a hardcoded list,
    // no AI/backend/randomness. Tapping the search entry always opens Chat regardless of the prompt.
    val prompts = listOf(
        stringResource(R.string.home_ask_prompt_1),
        stringResource(R.string.home_ask_prompt_2),
        stringResource(R.string.home_ask_prompt_3),
        stringResource(R.string.home_ask_prompt_4),
    )
    var promptIndex by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(PROMPT_ROTATION_MS)
            promptIndex = (promptIndex + 1) % prompts.size
        }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(
                Brush.linearGradient(
                    listOf(
                        Color(0xFF2E7DFF),
                        Color(0xFF0062CC),
                        Color(0xFF7C3AED),
                    ),
                ),
            )
            .padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // A blank name/null url still correctly falls back to the neutral placeholder when
            // signed out (UI Consistency Baseline v1).
            TappyAvatar(name = greetingName.orEmpty(), imageUrl = avatarUrl, size = TappyAvatarSize.HeaderUser)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (greetingName != null) "$greeting, $greetingName" else greeting,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
                // City placeholder — location is the (not-yet-built) location feature's concern;
                // show an honest "not set" affordance rather than a fabricated city.
                Row(
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.LocationOn,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.8f),
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = stringResource(R.string.home_location_not_set),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.8f),
                    )
                }
            }
        }
        // Search entry (web SearchBar variant="hero"): a light pill inside the gradient card.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(MaterialTheme.colorScheme.surface)
                .clickable(onClick = onOpenChat)
                .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Crossfade(
                targetState = promptIndex,
                label = "ask-tappy-prompt",
                modifier = Modifier.weight(1f),
            ) { index ->
                Text(
                    text = stringResource(R.string.home_ask_prefix, prompts[index]),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

private data class HomeCategory(val emoji: String, val labelRes: Int)

// Web parity (HomeView "Khám phá theo lĩnh vực" → CategoryPills): the five discovery categories,
// same set + order + emoji as web's lib/utils CATEGORIES (food, shopping, entertainment, travel,
// spa). Tapping opens Chat (web navigates to /chat?category=<id>).
private val HOME_CATEGORIES = listOf(
    HomeCategory("🍜", R.string.home_category_food),
    HomeCategory("🛍️", R.string.home_category_shopping),
    HomeCategory("🎭", R.string.home_category_entertainment),
    HomeCategory("✈️", R.string.home_category_travel),
    HomeCategory("💆", R.string.home_category_spa),
)

@Composable
private fun CategorySection(onOpenCategory: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_explore_by_category))
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            HOME_CATEGORIES.forEach { cat ->
                CategoryPill(emoji = cat.emoji, label = stringResource(cat.labelRes), onClick = onOpenCategory)
            }
        }
    }
}

@Composable
private fun CategoryPill(emoji: String, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = emoji, fontSize = 16.sp)
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
    }
}

private data class QuickAction(val label: String, val icon: ImageVector, val onClick: () -> Unit)

@Composable
private fun QuickActionsSection(
    onNavigateToTab: (HomeTab) -> Unit,
    onOpenMusic: () -> Unit,
    onOpenTranslate: () -> Unit,
    onOpenCurrency: () -> Unit,
    onOpenDeals: () -> Unit,
    onOpenGames: () -> Unit,
    onOpenScan: () -> Unit,
    onOpenSplitBill: () -> Unit,
) {
    val actions = listOf(
        QuickAction(stringResource(R.string.home_quick_explore), Icons.Filled.Explore) { onNavigateToTab(HomeTab.Explore) },
        QuickAction(stringResource(R.string.home_quick_maps), Icons.Filled.Map) { onNavigateToTab(HomeTab.Maps) },
        QuickAction(stringResource(R.string.home_quick_music), Icons.Filled.MusicNote) { onOpenMusic() },
        QuickAction(stringResource(R.string.home_quick_scan), Icons.Filled.QrCodeScanner) { onOpenScan() },
        QuickAction(stringResource(R.string.home_quick_translate), Icons.Filled.Translate) { onOpenTranslate() },
        QuickAction(stringResource(R.string.home_quick_games), Icons.Filled.SportsEsports) { onOpenGames() },
        QuickAction(stringResource(R.string.home_quick_currency), Icons.Filled.CurrencyExchange) { onOpenCurrency() },
        QuickAction(stringResource(R.string.home_quick_deals), Icons.Filled.LocalOffer) { onOpenDeals() },
        QuickAction(stringResource(R.string.splitbill_title), Icons.Filled.Calculate) { onOpenSplitBill() },
    )

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_section_quick_actions))
        actions.chunked(COLUMNS).forEach { rowActions ->
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                rowActions.forEach { action ->
                    QuickActionTile(action = action, modifier = Modifier.weight(1f))
                }
                // Pad a short final row so tiles keep their column width instead of stretching.
                repeat(COLUMNS - rowActions.size) { Spacer(modifier = Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun QuickActionTile(action: QuickAction, modifier: Modifier = Modifier) {
    TappyCard(
        modifier = modifier
            .clip(TappyShapes.card)
            .clickable(onClick = action.onClick),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            Icon(
                imageVector = action.icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp),
            )
            Text(
                text = action.label,
                style = MaterialTheme.typography.labelMedium,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun SuggestionsSection(state: UiState<List<String>>, onSuggestionClick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_section_suggested))
        when (state) {
            UiState.Loading -> LoadingBlock()
            is UiState.Success -> {
                // Dynamic prompts from /api/suggested-prompts — tapping one opens Chat pre-filled.
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    state.data.forEach { prompt ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(TappyShapes.card)
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                                .clickable { onSuggestionClick(prompt) }
                                .padding(TappySpacing.md),
                            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.Lightbulb, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                            Text(text = prompt, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
            // Idle / Empty / Error all resolve to the honest empty state.
            else -> TappyEmptyState(
                icon = Icons.Filled.Lightbulb,
                title = stringResource(R.string.home_empty_suggestions_title),
                message = stringResource(R.string.home_empty_suggestions_message),
            )
        }
    }
}

@Composable
private fun RecentActivitySection(state: UiState<List<String>>) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_section_recent_activity))
        when (state) {
            UiState.Loading -> LoadingBlock()
            is UiState.Success -> {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    state.data.forEach { Text(text = it, style = MaterialTheme.typography.bodyMedium) }
                }
            }
            else -> TappyEmptyState(
                icon = Icons.Filled.History,
                title = stringResource(R.string.home_empty_recent_title),
                message = stringResource(R.string.home_empty_recent_message),
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
        entries.forEach { entry ->
            TappyCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(TappyShapes.card)
                    .clickable(onClick = entry.onClick),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = entry.emoji, style = MaterialTheme.typography.headlineSmall)
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = entry.title,
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = entry.description,
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
}

/** The web's Home "Recommendations" card (`✨` Sparkles icon, title, description) — its own
 *  featured section, opening the personalized recommendations screen. Mirrors the web placing
 *  Recommendations as a dedicated Home entry, not a quick-action tile. */
@Composable
private fun RecommendationsSection(onOpenRecommendations: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_recommendations_section))
        TappyCard(
            modifier = Modifier
                .fillMaxWidth()
                .clip(TappyShapes.card)
                .clickable(onClick = onOpenRecommendations),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.home_recommendations_card_title),
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(R.string.home_recommendations_card_desc),
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

/** A single featured card, mirroring the web's "Content writer" Home section (`✍️` icon, title,
 *  description, chevron) — not a quick-action tile, since the web places this as its own section
 *  rather than in the quick-actions grid. */
@Composable
private fun ContentWriterSection(onOpenVietWriter: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_content_writer_title))
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
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
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
