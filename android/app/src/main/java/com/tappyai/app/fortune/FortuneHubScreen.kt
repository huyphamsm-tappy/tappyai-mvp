package com.tappyai.app.fortune

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

private data class FortuneFeature(
    val emoji: String,
    val title: String,
    val description: String,
    val onClick: () -> Unit,
)

@Composable
fun FortuneHubScreen(
    onBack: () -> Unit,
    onOpenTarot: () -> Unit,
    onOpenTuVi: () -> Unit,
    onOpenZodiac: () -> Unit,
) {
    val features = listOf(
        FortuneFeature(
            emoji = "🔮",
            title = stringResource(R.string.fortune_hub_tarot_title),
            description = stringResource(R.string.fortune_hub_tarot_description),
            onClick = onOpenTarot,
        ),
        FortuneFeature(
            emoji = "🧧",
            title = stringResource(R.string.fortune_hub_tuvi_title),
            description = stringResource(R.string.fortune_hub_tuvi_description),
            onClick = onOpenTuVi,
        ),
        FortuneFeature(
            emoji = "✨",
            title = stringResource(R.string.fortune_hub_zodiac_title),
            description = stringResource(R.string.fortune_hub_zodiac_description),
            onClick = onOpenZodiac,
        ),
    )

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
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = stringResource(R.string.fortune_hub_title), style = MaterialTheme.typography.titleLarge)
            }

            features.forEach { feature ->
                FortuneFeatureCard(feature = feature)
            }

            Text(
                text = stringResource(R.string.fortune_disclaimer),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = TappySpacing.sm),
            )
        }
    }
}

@Composable
private fun FortuneFeatureCard(feature: FortuneFeature) {
    TappyCard(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .clickable(onClick = feature.onClick),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = feature.emoji,
                style = MaterialTheme.typography.headlineMedium,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = feature.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = feature.description,
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
