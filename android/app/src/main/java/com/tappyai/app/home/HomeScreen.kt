package com.tappyai.app.home

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
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
            HomeHero(greeting = viewModel.greeting)
            AskTappyCard(onClick = { onNavigateToTab(HomeTab.Chat) })
            QuickActionsSection(
                onNavigateToTab = onNavigateToTab,
                onOpenMusic = onOpenMusic,
                onOpenTranslate = onOpenTranslate,
                onOpenCurrency = onOpenCurrency,
                onOpenDeals = onOpenDeals,
                onOpenGames = onOpenGames,
                onOpenScan = onOpenScan,
            )
            RecommendationsSection(onOpenRecommendations = onOpenRecommendations)
            FortuneSection(
                onOpenTarot = onOpenTarot,
                onOpenTuVi = onOpenTuVi,
                onOpenZodiac = onOpenZodiac,
            )
            ContentWriterSection(onOpenVietWriter = onOpenVietWriter)
            SuggestionsSection(state = suggestions)
            RecentActivitySection(state = recentActivity)
        }
    }

}

@Composable
private fun HomeHero(greeting: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Identity placeholder — no signed-in user in this foundation. A blank name makes
        // TappyAvatar render the neutral person icon, matching the Profile header's convention
        // (UI Consistency Baseline v1: never fabricate a "Guest"/fake user). The greeting below
        // is Home's own time-based launchpad greeting, not an identity claim.
        TappyAvatar(name = "", size = TappyAvatarSize.HeaderUser)
        Column(modifier = Modifier.weight(1f)) {
            Text(text = greeting, style = MaterialTheme.typography.titleLarge)
            // City placeholder — location is the (not-yet-built) location feature's concern; show
            // an honest "not set" affordance rather than a fabricated city.
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.LocationOn,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = stringResource(R.string.home_location_not_set),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AskTappyCard(onClick: () -> Unit) {
    // Cycle through a fixed set of local example prompts to hint at what Tappy can do. Purely
    // presentational — deterministic timer rotation over a hardcoded list, no AI, no backend,
    // no randomness. Tapping the card always opens Chat regardless of the shown prompt.
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
private fun SuggestionsSection(state: UiState<List<String>>) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionHeader(title = stringResource(R.string.home_section_suggested))
        when (state) {
            UiState.Loading -> LoadingBlock()
            is UiState.Success -> {
                // No real suggestion source is wired yet, so this branch is unreachable today;
                // it's here so connecting data later is a one-line ViewModel change.
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    state.data.forEach { Text(text = it, style = MaterialTheme.typography.bodyMedium) }
                }
            }
            // Idle / Empty / Error all resolve to the honest empty state for now.
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
