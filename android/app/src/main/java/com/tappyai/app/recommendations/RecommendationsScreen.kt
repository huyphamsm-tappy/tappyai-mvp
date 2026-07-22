package com.tappyai.app.recommendations

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.common.UiState
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyEmptyState
import com.tappyai.core.designsystem.component.TappyErrorState
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Personalized recommendations ("✨ Gợi ý cho bạn") — mirrors the web `/recommendations` page.
 * A subtitle that flips on [Recommendations.personalized], root-level [Recommendations.explanation]
 * chips, then a ranked list of places each with its matched-signal chips and an "ask Tappy about
 * this place" shortcut. An empty ranked list shows the "not enough data yet" state, exactly like
 * the web. [onAskAboutPlace] carries the fully-resolved "Kể mình nghe về …" prompt up so the host
 * can open Chat pre-filled with it — the same query string the web navigates to.
 */
@Composable
fun RecommendationsScreen(
    onBack: () -> Unit,
    onAskAboutPlace: (prompt: String) -> Unit,
    viewModel: RecommendationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    val personalized = (state as? UiState.Success)?.data?.personalized == true

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = TappyContainers.content)
                .fillMaxWidth()
                .fillMaxSize()
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = stringResource(R.string.recommendations_title), style = MaterialTheme.typography.titleLarge)
            }

            // Always shown (matches the web) — the subtitle sits above every state.
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = stringResource(
                        if (personalized) R.string.recommendations_subtitle_personalized
                        else R.string.recommendations_subtitle_popular,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            when (val s = state) {
                UiState.Loading, UiState.Idle -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    TappyLoadingIndicator()
                }
                is UiState.Error -> TappyErrorState(
                    title = stringResource(R.string.recommendations_error_title),
                    message = s.message,
                    onRetry = viewModel::retry,
                )
                // No dedicated Empty state is emitted — an empty ranked list arrives as Success and
                // renders the "not enough data" block below (parity with the web).
                UiState.Empty -> RecommendationsContent(
                    data = Recommendations(emptyList(), emptyList(), personalized),
                    onAskAboutPlace = onAskAboutPlace,
                )
                is UiState.Success -> RecommendationsContent(data = s.data, onAskAboutPlace = onAskAboutPlace)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RecommendationsContent(
    data: Recommendations,
    onAskAboutPlace: (prompt: String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        if (data.explanation.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                data.explanation.forEach { ExplanationChip(text = it) }
            }
        }

        if (data.items.isEmpty()) {
            TappyEmptyState(
                icon = Icons.Filled.AutoAwesome,
                title = stringResource(R.string.recommendations_empty_title),
                message = stringResource(R.string.recommendations_empty_message),
            )
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
            ) {
                itemsIndexed(items = data.items, key = { _, it -> it.placeId }) { index, item ->
                    // Mirror the web's prompt: "Kể mình nghe về {placeName || 'địa điểm này'}".
                    val place = item.placeName.ifBlank { stringResource(R.string.recommendations_ask_prompt_fallback) }
                    val prompt = stringResource(R.string.recommendations_ask_prompt, place)
                    RecommendationCard(
                        rank = index + 1,
                        item = item,
                        onAsk = { onAskAboutPlace(prompt) },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RecommendationCard(rank: Int, item: Recommendation, onAsk: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(colors.primary),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = rank.toString(),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = colors.onPrimary,
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                Text(
                    text = item.placeName.ifBlank { stringResource(R.string.recommendations_place_fallback) },
                    style = MaterialTheme.typography.titleSmall,
                    color = colors.onSurface,
                )
                if (item.matchedSignals.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                        // Cap at four, matching the web's `.slice(0, 4)`.
                        item.matchedSignals.take(4).forEach { SignalChip(text = it) }
                    }
                }
                Row(
                    modifier = Modifier.clickable(onClick = onAsk),
                    horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Chat,
                        contentDescription = null,
                        tint = colors.primary,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = stringResource(R.string.recommendations_ask_tappy),
                        style = MaterialTheme.typography.labelMedium,
                        color = colors.primary,
                    )
                }
            }
        }
    }
}

@Composable
private fun ExplanationChip(text: String) {
    Box(
        modifier = Modifier
            .clip(TappyShapes.pill)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

@Composable
private fun SignalChip(text: String) {
    Box(
        modifier = Modifier
            .clip(TappyShapes.pill)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = TappySpacing.sm, vertical = 2.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
