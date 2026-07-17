package com.tappyai.app.fortune.tarot

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

@Composable
fun TarotScreen(onBack: () -> Unit, viewModel: TarotViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

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
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = "🔮 " + stringResource(R.string.fortune_tarot_header), style = MaterialTheme.typography.titleLarge)
            }

            when (val s = state) {
                is TarotState.Idle -> IdleContent(
                    drawCount = viewModel.drawCount,
                    onDrawCountChange = viewModel::onDrawCountChange,
                    onDraw = viewModel::onDraw,
                )
                is TarotState.Drawing -> DrawingContent()
                is TarotState.Drawn -> DrawnContent(
                    cards = s.cards,
                    onReset = viewModel::onReset,
                )
            }

            Text(
                text = stringResource(R.string.fortune_disclaimer),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun IdleContent(
    drawCount: Int,
    onDrawCountChange: (Int) -> Unit,
    onDraw: () -> Unit,
) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Text(text = "🔮", style = MaterialTheme.typography.displayMedium)

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = stringResource(R.string.fortune_tarot_draw_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.fortune_tarot_draw_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                FilterChip(
                    selected = drawCount == 1,
                    onClick = { onDrawCountChange(1) },
                    label = { Text(stringResource(R.string.fortune_tarot_one_card_chip)) },
                )
                FilterChip(
                    selected = drawCount == 3,
                    onClick = { onDrawCountChange(3) },
                    label = { Text(stringResource(R.string.fortune_tarot_three_cards_chip)) },
                )
            }

            TappyButton(
                text = stringResource(R.string.fortune_tarot_draw_now),
                onClick = onDraw,
                leadingIcon = { Icon(Icons.Filled.AutoAwesome, contentDescription = null) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun DrawingContent() {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Spacer(modifier = Modifier.height(TappySpacing.xl))
            TappyLoadingIndicator()
            Text(
                text = stringResource(R.string.fortune_tarot_shuffling),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(TappySpacing.xl))
        }
    }
}

@Composable
private fun DrawnContent(cards: List<DrawnCard>, onReset: () -> Unit) {
    val positionLabels = listOf(
        stringResource(R.string.fortune_tarot_past),
        stringResource(R.string.fortune_tarot_present),
        stringResource(R.string.fortune_tarot_future),
    )

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        cards.forEachIndexed { index, drawn ->
            DrawnCardItem(
                drawn = drawn,
                positionLabel = if (cards.size == 3) positionLabels.getOrNull(index) else null,
            )
        }
    }

    TappyButton(
        text = stringResource(R.string.fortune_tarot_redraw),
        onClick = onReset,
        variant = TappyButtonVariant.Secondary,
        leadingIcon = { Icon(Icons.Filled.Refresh, contentDescription = null) },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun DrawnCardItem(drawn: DrawnCard, positionLabel: String?) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            if (positionLabel != null) {
                Text(
                    text = positionLabel.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            Text(text = drawn.card.emoji, style = MaterialTheme.typography.displaySmall)

            Text(
                text = drawn.card.nameVi,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )

            Text(
                text = if (drawn.reversed) stringResource(R.string.fortune_tarot_reversed) else stringResource(R.string.fortune_tarot_upright),
                style = MaterialTheme.typography.labelSmall,
                color = if (drawn.reversed) MaterialTheme.colorScheme.error
                else MaterialTheme.colorScheme.primary,
            )

            val keywords = if (drawn.reversed) drawn.card.keywordsReversed else drawn.card.keywordsUpright
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                keywords.forEachIndexed { index, keyword ->
                    if (index > 0) {
                        Text(
                            text = "·",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        text = keyword,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Text(
                text = if (drawn.reversed) drawn.card.meaningReversed else drawn.card.meaningUpright,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Start,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
