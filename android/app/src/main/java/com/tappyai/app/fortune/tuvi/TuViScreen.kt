package com.tappyai.app.fortune.tuvi

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.MonetizationOn
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign

import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

@Composable
fun TuViScreen(onBack: () -> Unit, viewModel: TuViViewModel = hiltViewModel()) {
    val result = viewModel.result

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
                Text(text = "🧧 " + stringResource(R.string.fortune_tuvi_header), style = MaterialTheme.typography.titleLarge)
            }

            if (result == null) {
                InputCard(
                    birthYear = viewModel.birthYear,
                    onBirthYearChange = viewModel::onBirthYearChange,
                    onSubmit = viewModel::onSubmit,
                )
            } else {
                ResultContent(
                    result = result,
                    period = viewModel.period,
                    onPeriodChange = viewModel::onPeriodChange,
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
private fun InputCard(
    birthYear: String,
    onBirthYearChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Text(text = "🧧", style = MaterialTheme.typography.displayMedium)

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = stringResource(R.string.fortune_tuvi_form_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.fortune_tuvi_form_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            TappyTextField(
                value = birthYear,
                onValueChange = onBirthYearChange,
                label = stringResource(R.string.fortune_tuvi_birth_year_label),
                keyboardType = KeyboardType.Number,
                modifier = Modifier.fillMaxWidth(),
            )

            TappyButton(
                text = stringResource(R.string.fortune_tuvi_submit),
                onClick = onSubmit,
                enabled = birthYear.length == 4,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ResultContent(
    result: TuViResult,
    period: TuViPeriod,
    onPeriodChange: (TuViPeriod) -> Unit,
    onReset: () -> Unit,
) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Text(text = result.canChi.emoji, style = MaterialTheme.typography.displayMedium)
            Text(
                text = "${result.canChi.nameVi} — ${result.canChi.animalVi}",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = result.canChi.traits,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
    ) {
        TuViPeriod.entries.forEach { p ->
            FilterChip(
                selected = period == p,
                onClick = { onPeriodChange(p) },
                label = { Text(p.label(), style = MaterialTheme.typography.labelSmall) },
                modifier = Modifier.weight(1f),
            )
        }
    }

    val reading = result.readings.getOrNull(TuViPeriod.entries.indexOf(period))
    if (reading != null) {
        ReadingCard(reading = reading)
    }

    TappyButton(
        text = stringResource(R.string.fortune_tuvi_change_year),
        onClick = onReset,
        variant = TappyButtonVariant.Secondary,
        leadingIcon = { Icon(Icons.Filled.Refresh, contentDescription = null) },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun ReadingCard(reading: TuViReading) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = reading.periodLabel,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                StarRow(score = reading.score)
            }

            FortuneRow(
                icon = Icons.Filled.Favorite, label = stringResource(R.string.fortune_love),
                text = reading.love, tint = Color(0xFFE91E63),
            )
            FortuneRow(
                icon = Icons.Filled.Work, label = stringResource(R.string.fortune_career_life),
                text = reading.career, tint = MaterialTheme.colorScheme.primary,
            )
            FortuneRow(
                icon = Icons.Filled.MonetizationOn, label = stringResource(R.string.fortune_money),
                text = reading.money, tint = Color(0xFFFFC107),
            )
            FortuneRow(
                icon = Icons.Filled.HealthAndSafety, label = stringResource(R.string.fortune_health),
                text = reading.health, tint = Color(0xFF4CAF50),
            )
        }
    }
}

@Composable
private fun FortuneRow(icon: ImageVector, label: String, text: String, tint: Color) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(20.dp),
        )
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun StarRow(score: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        repeat(5) { index ->
            Icon(
                imageVector = Icons.Filled.Star,
                contentDescription = null,
                tint = if (index < score) Color(0xFFFFC107) else MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(14.dp),
            )
        }
    }
}
