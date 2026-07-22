package com.tappyai.app.fortune.zodiac

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
fun ZodiacScreen(onBack: () -> Unit, viewModel: ZodiacViewModel = hiltViewModel()) {
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
                Text(text = "✨ " + stringResource(R.string.fortune_zodiac_header), style = MaterialTheme.typography.titleLarge)
            }

            if (result == null) {
                InputCard(
                    birthDay = viewModel.birthDay,
                    birthMonth = viewModel.birthMonth,
                    onBirthDayChange = viewModel::onBirthDayChange,
                    onBirthMonthChange = viewModel::onBirthMonthChange,
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
    birthDay: String,
    birthMonth: String,
    onBirthDayChange: (String) -> Unit,
    onBirthMonthChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    // Mirrors ZodiacViewModel.onSubmit()'s validation exactly, so the button's enabled state and
    // the actual submit no-op never disagree — a day bound checked against the real month length
    // (2000 as a leap-year reference so Feb 29 stays valid), not a flat 1..31.
    val month = birthMonth.toIntOrNull()
    val day = birthDay.toIntOrNull()
    val isValid = month != null && month in 1..12 &&
        day != null && day in 1..java.time.YearMonth.of(2000, month).lengthOfMonth()

    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
        ) {
            Text(text = "✨", style = MaterialTheme.typography.displayMedium)

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = stringResource(R.string.fortune_zodiac_form_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = stringResource(R.string.fortune_zodiac_form_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                TappyTextField(
                    value = birthDay,
                    onValueChange = onBirthDayChange,
                    label = stringResource(R.string.fortune_zodiac_day_label),
                    keyboardType = KeyboardType.Number,
                    modifier = Modifier.weight(1f),
                )
                TappyTextField(
                    value = birthMonth,
                    onValueChange = onBirthMonthChange,
                    label = stringResource(R.string.fortune_zodiac_month_label),
                    keyboardType = KeyboardType.Number,
                    modifier = Modifier.weight(1f),
                )
            }

            TappyButton(
                text = stringResource(R.string.fortune_zodiac_submit),
                onClick = onSubmit,
                enabled = isValid,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ResultContent(
    result: ZodiacResult,
    period: ZodiacPeriod,
    onPeriodChange: (ZodiacPeriod) -> Unit,
    onReset: () -> Unit,
) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        ) {
            Text(text = result.sign.emoji, style = MaterialTheme.typography.displayMedium)
            Text(
                text = result.sign.nameVi,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = "${result.sign.dateRangeLabel} · ${result.sign.element} · ${result.sign.ruling}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = result.sign.traits,
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
        ZodiacPeriod.entries.forEach { p ->
            FilterChip(
                selected = period == p,
                onClick = { onPeriodChange(p) },
                label = { Text(p.label(), style = MaterialTheme.typography.labelSmall) },
                modifier = Modifier.weight(1f),
            )
        }
    }

    val reading = result.readings.getOrNull(ZodiacPeriod.entries.indexOf(period))
    if (reading != null) {
        ReadingCard(reading = reading)
    }

    TappyButton(
        text = stringResource(R.string.fortune_redo_with_other_date),
        onClick = onReset,
        variant = TappyButtonVariant.Secondary,
        leadingIcon = { Icon(Icons.Filled.Refresh, contentDescription = null) },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun ReadingCard(reading: ZodiacReading) {
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

            FortuneRow(Icons.Filled.Favorite, stringResource(R.string.fortune_love), reading.love, Color(0xFFE91E63))
            FortuneRow(Icons.Filled.Work, stringResource(R.string.fortune_career_life), reading.career, MaterialTheme.colorScheme.primary)
            FortuneRow(Icons.Filled.MonetizationOn, stringResource(R.string.fortune_money), reading.money, Color(0xFFFFC107))
            FortuneRow(Icons.Filled.HealthAndSafety, stringResource(R.string.fortune_health), reading.health, Color(0xFF4CAF50))
        }
    }
}

@Composable
private fun FortuneRow(icon: ImageVector, label: String, text: String, tint: Color) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
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
