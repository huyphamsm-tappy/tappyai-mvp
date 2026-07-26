package com.tappyai.app.fortune.tuvi

import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.MenuBook
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.fortune.engine.FortuneReading
import com.tappyai.app.fortune.engine.LifeStage
import com.tappyai.app.fortune.engine.MonthlyFortune
import com.tappyai.app.fortune.engine.generateFortune
import com.tappyai.app.fortune.engine.generateLifeStages
import com.tappyai.app.fortune.engine.generateMonthlyBreakdown
import com.tappyai.app.fortune.engine.generateYearFortune
import com.tappyai.app.fortune.zodiac.LuckyRow
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

@Composable
fun TuViScreen(onBack: () -> Unit, viewModel: TuViViewModel = hiltViewModel()) {
    val result = viewModel.result

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier.widthIn(max = TappyContainers.content).fillMaxWidth().padding(TappySpacing.xl),
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
                    birthDay = viewModel.birthDay,
                    birthMonth = viewModel.birthMonth,
                    birthYear = viewModel.birthYear,
                    canSubmit = viewModel.canSubmit,
                    onBirthDayChange = viewModel::onBirthDayChange,
                    onBirthMonthChange = viewModel::onBirthMonthChange,
                    onBirthYearChange = viewModel::onBirthYearChange,
                    onSubmit = viewModel::onSubmit,
                )
            } else {
                ResultContent(
                    result = result,
                    mode = viewModel.mode,
                    selectedYear = viewModel.selectedYear,
                    yearOptions = viewModel.yearOptions,
                    onModeChange = viewModel::onModeChange,
                    onSelectedYearChange = viewModel::onSelectedYearChange,
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
    birthYear: String,
    canSubmit: Boolean,
    onBirthDayChange: (String) -> Unit,
    onBirthMonthChange: (String) -> Unit,
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
                Text(stringResource(R.string.fortune_tuvi_form_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    stringResource(R.string.fortune_tuvi_form_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                TappyTextField(value = birthDay, onValueChange = onBirthDayChange, label = stringResource(R.string.fortune_zodiac_day_label), keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
                TappyTextField(value = birthMonth, onValueChange = onBirthMonthChange, label = stringResource(R.string.fortune_zodiac_month_label), keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f))
            }
            TappyTextField(value = birthYear, onValueChange = onBirthYearChange, label = stringResource(R.string.fortune_tuvi_birth_year_label), keyboardType = KeyboardType.Number, modifier = Modifier.fillMaxWidth())
            TappyButton(text = stringResource(R.string.fortune_tuvi_submit), onClick = onSubmit, enabled = canSubmit, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun ResultContent(
    result: TuViResult,
    mode: TuViMode,
    selectedYear: Int,
    yearOptions: List<Int>,
    onModeChange: (TuViMode) -> Unit,
    onSelectedYearChange: (Int) -> Unit,
    onReset: () -> Unit,
) {
    // Header
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Text(text = result.canChi.emoji, style = MaterialTheme.typography.displayMedium)
            Text("${result.canChi.nameVi} — ${result.canChi.animalVi}", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
            Text(stringResource(R.string.fortune_ngu_hanh, result.nguHanh), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Text(result.canChi.traits, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
    }

    // Mode selector (Day / Week / Month / Lifetime / By-Year) — web parity.
    Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        TuViMode.entries.forEach { m ->
            FilterChip(selected = mode == m, onClick = { onModeChange(m) }, label = { Text(m.label(), style = MaterialTheme.typography.labelSmall) })
        }
    }

    when (mode.period) {
        null -> when (mode) {
            TuViMode.Lifetime -> LifetimeContent(result)
            TuViMode.Year -> YearContent(result, selectedYear, yearOptions, onSelectedYearChange)
            else -> Unit
        }
        else -> {
            val reading = remember(result, mode) {
                generateFortune(result.canChi.seedId, mode.period!!, CANCHI_BANKS.getValue(result.canChi.seedId))
            }
            PeriodReadingCard(reading)
        }
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
private fun PeriodReadingCard(reading: FortuneReading) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(reading.periodLabel, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                StarRow(score = reading.score)
            }
            FortuneRow(Icons.Filled.Favorite, stringResource(R.string.fortune_love), reading.love, Color(0xFFE91E63))
            FortuneRow(Icons.Filled.Work, stringResource(R.string.fortune_career_life), reading.career, MaterialTheme.colorScheme.primary)
            FortuneRow(Icons.Filled.MonetizationOn, stringResource(R.string.fortune_money), reading.money, Color(0xFFFFC107))
            FortuneRow(Icons.Filled.HealthAndSafety, stringResource(R.string.fortune_health), reading.health, Color(0xFF4CAF50))
            LuckyRow(luckyNumber = reading.luckyNumber, luckyColor = reading.luckyColor)
        }
    }
}

@Composable
private fun LifetimeContent(result: TuViResult) {
    val lifetime = LIFETIME_READINGS[result.canChi.seedId]
    val stages = remember(result) { generateLifeStages(result.canChi.seedId, result.birthMonth, result.birthDay) }
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        if (lifetime != null) {
            TappyCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                        Icon(Icons.Filled.MenuBook, contentDescription = null, tint = Color(0xFF8B5CF6), modifier = Modifier.size(16.dp))
                        Text(stringResource(R.string.fortune_lifetime_title, result.canChi.animalVi), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                    }
                    Text(lifetime.overview, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    FortuneRow(Icons.Filled.Work, stringResource(R.string.fortune_career_life), lifetime.career, MaterialTheme.colorScheme.primary)
                    FortuneRow(Icons.Filled.Favorite, stringResource(R.string.fortune_love), lifetime.love, Color(0xFFE91E63))
                    FortuneRow(Icons.Filled.HealthAndSafety, stringResource(R.string.fortune_health), lifetime.health, Color(0xFF4CAF50))
                    Column(
                        modifier = Modifier.fillMaxWidth().clip(TappyShapes.card).background(Color(0xFF8B5CF6).copy(alpha = 0.1f)).padding(TappySpacing.md),
                        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                    ) {
                        Text(stringResource(R.string.fortune_lifetime_advice), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = Color(0xFF8B5CF6))
                        Text(lifetime.advice, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }
        TappyCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                Text(stringResource(R.string.fortune_life_stages), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                stages.forEach { StageCard(it) }
            }
        }
    }
}

@Composable
private fun StageCard(stage: LifeStage) {
    var open by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxWidth().clip(TappyShapes.card).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { open = !open }.padding(TappySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stage.emoji, style = MaterialTheme.typography.titleMedium)
            Column(modifier = Modifier.weight(1f)) {
                Text(stage.label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                Text(stage.ageRange, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(if (open) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (open) {
            Column(modifier = Modifier.fillMaxWidth().padding(start = TappySpacing.md, end = TappySpacing.md, bottom = TappySpacing.md), verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                Text(stage.fate, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FortuneRow(Icons.Filled.Work, stringResource(R.string.fortune_career_life), stage.career, MaterialTheme.colorScheme.primary)
                FortuneRow(Icons.Filled.Favorite, stringResource(R.string.fortune_love), stage.love, Color(0xFFE91E63))
            }
        }
    }
}

@Composable
private fun YearContent(result: TuViResult, selectedYear: Int, yearOptions: List<Int>, onYearChange: (Int) -> Unit) {
    val reading = remember(result, selectedYear) { generateYearFortune(result.canChi.seedId, result.birthYear, selectedYear) }
    val months = remember(result, selectedYear) { generateMonthlyBreakdown(result.canChi.seedId, result.birthYear, result.birthMonth, result.birthDay, selectedYear) }
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        // Year picker
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = Color(0xFFF59E0B), modifier = Modifier.size(16.dp))
            Text(stringResource(R.string.fortune_pick_year), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
        }
        Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            yearOptions.forEach { y ->
                FilterChip(selected = y == selectedYear, onClick = { onYearChange(y) }, label = { Text("$y", style = MaterialTheme.typography.labelSmall) })
            }
        }
        // Compatibility note
        Column(
            modifier = Modifier.fillMaxWidth().clip(TappyShapes.card).background(Color(0xFFF59E0B).copy(alpha = 0.1f)).padding(TappySpacing.md),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Text(
                text = if (reading.compatLabel != "—") reading.compatLabel
                else stringResource(R.string.fortune_tuvi_compat_fallback, result.canChi.animalVi, reading.yearAnimal),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFFF59E0B),
            )
            Text(reading.compatNote, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
        }
        // Year overview
        TappyCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.fortune_year_overview, reading.periodLabel), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                    StarRow(reading.score)
                }
                FortuneRow(Icons.Filled.Favorite, stringResource(R.string.fortune_love), reading.love, Color(0xFFE91E63))
                FortuneRow(Icons.Filled.Work, stringResource(R.string.fortune_career_life), reading.career, MaterialTheme.colorScheme.primary)
                FortuneRow(Icons.Filled.MonetizationOn, stringResource(R.string.fortune_money), reading.money, Color(0xFFFFC107))
                FortuneRow(Icons.Filled.HealthAndSafety, stringResource(R.string.fortune_health), reading.health, Color(0xFF4CAF50))
                LuckyRow(luckyNumber = reading.luckyNumber, luckyColor = reading.luckyColor)
            }
        }
        // Monthly breakdown
        TappyCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                Text(stringResource(R.string.fortune_monthly_breakdown), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                months.forEach { MonthCard(it) }
            }
        }
    }
}

@Composable
private fun MonthCard(month: MonthlyFortune) {
    var open by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxWidth().clip(TappyShapes.card).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))) {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { open = !open }.padding(TappySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(month.monthName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
            StarRow(month.score)
            Icon(if (open) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (open) {
            Column(modifier = Modifier.fillMaxWidth().padding(start = TappySpacing.md, end = TappySpacing.md, bottom = TappySpacing.md), verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                FortuneRow(Icons.Filled.Favorite, stringResource(R.string.fortune_love), month.love, Color(0xFFE91E63))
                FortuneRow(Icons.Filled.Work, stringResource(R.string.fortune_career_life), month.career, MaterialTheme.colorScheme.primary)
                FortuneRow(Icons.Filled.MonetizationOn, stringResource(R.string.fortune_money), month.money, Color(0xFFFFC107))
                FortuneRow(Icons.Filled.HealthAndSafety, stringResource(R.string.fortune_health), month.health, Color(0xFF4CAF50))
                Text(month.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun FortuneRow(icon: ImageVector, label: String, text: String, tint: Color) {
    Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), verticalAlignment = Alignment.Top) {
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
