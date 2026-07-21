package com.tappyai.app.splitbill

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import java.text.NumberFormat
import java.util.Locale

/**
 * Split Bill — a faithful native port of the web `/split-bill` page (100% client-side math, no
 * backend). Two modes mirror the web exactly: "Chia đều" (tip applied to the whole bill, then split
 * by headcount) and "Chia theo món" (each person's own amount, grossed up by the same tip %).
 * All amounts are Vietnamese đồng, rounded to whole đồng for display (see the disclaimer), matching
 * the web's `toLocaleString('vi-VN', { maximumFractionDigits: 0 })`.
 */
private enum class SplitMode { Equal, Custom }

private class SplitPerson(val id: Int, name: String, amount: String) {
    var name by mutableStateOf(name)
    var amount by mutableStateOf(amount)
}

private val TIP_PRESETS = listOf(0, 5, 10, 15, 20)
private const val MIN_PEOPLE = 2
private const val MAX_PEOPLE = 20

@Composable
fun SplitBillScreen(onBack: () -> Unit) {
    val defaultNameFmt = stringResource(R.string.split_person_default_name)
    var total by remember { mutableStateOf("") }
    var people by remember { mutableIntStateOf(2) }
    // `tip` holds the selected preset; -1 means "no preset" (a custom tip was typed).
    var tip by remember { mutableIntStateOf(0) }
    var customTip by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(SplitMode.Equal) }
    val nextId = remember { mutableIntStateOf(3) }
    val persons = remember {
        mutableStateListOf(
            SplitPerson(1, String.format(defaultNameFmt, 1), ""),
            SplitPerson(2, String.format(defaultNameFmt, 2), ""),
        )
    }

    val fmt = remember { NumberFormat.getNumberInstance(Locale("vi", "VN")).apply { maximumFractionDigits = 0 } }

    // Derived values (recomputed every recomposition — same as the web's inline consts).
    val activeTip: Double = if (customTip.isNotBlank()) customTip.toDoubleOrNull() ?: 0.0
    else if (tip >= 0) tip.toDouble() else 0.0
    val totalNum: Double = total.filter { it.isDigit() || it == '.' }.toDoubleOrNull() ?: 0.0
    val grandTotal = totalNum * (1 + activeTip / 100)
    val perPerson = if (people > 0) grandTotal / people else 0.0
    val customTotal = persons.sumOf { it.amount.toDoubleOrNull() ?: 0.0 }
    val customGrand = customTotal * (1 + activeTip / 100)

    fun syncPeople(n: Int) {
        people = n
        if (mode == SplitMode.Equal) return
        while (persons.size < n) {
            persons.add(SplitPerson(nextId.intValue, String.format(defaultNameFmt, persons.size + 1), ""))
            nextId.intValue++
        }
        while (persons.size > n) persons.removeAt(persons.lastIndex)
    }

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
                Text(text = stringResource(R.string.split_title), style = MaterialTheme.typography.titleLarge)
            }

            // Card 1 — bill total + people
            TappyCard {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    FieldLabel(stringResource(R.string.split_bill_total_label))
                    TappyTextField(
                        value = total,
                        onValueChange = { total = it },
                        placeholder = stringResource(R.string.split_bill_total_placeholder),
                        singleLine = true,
                        keyboardType = KeyboardType.Number,
                    )
                    FieldLabel(stringResource(R.string.split_people_label))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                    ) {
                        StepperButton(icon = Icons.Filled.Remove, onClick = { syncPeople((people - 1).coerceAtLeast(MIN_PEOPLE)) })
                        Text(
                            text = people.toString(),
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        StepperButton(icon = Icons.Filled.Add, onClick = { syncPeople((people + 1).coerceAtMost(MAX_PEOPLE)) })
                        Text(
                            text = stringResource(R.string.split_people_unit),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Card 2 — tip
            TappyCard {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    FieldLabel(stringResource(R.string.split_tip_label))
                    Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                        TIP_PRESETS.forEach { preset ->
                            SelectableChip(
                                label = if (preset == 0) stringResource(R.string.split_tip_none) else "$preset%",
                                selected = customTip.isBlank() && tip == preset,
                                onClick = { tip = preset; customTip = "" },
                            )
                        }
                    }
                    TappyTextField(
                        value = customTip,
                        onValueChange = { customTip = it; tip = -1 },
                        placeholder = stringResource(R.string.split_tip_custom_placeholder),
                        singleLine = true,
                        keyboardType = KeyboardType.Number,
                    )
                }
            }

            // Mode toggle
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(TappyShapes.input)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(TappySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                ModeButton(
                    label = stringResource(R.string.split_mode_equal),
                    selected = mode == SplitMode.Equal,
                    onClick = { mode = SplitMode.Equal },
                    modifier = Modifier.weight(1f),
                )
                ModeButton(
                    label = stringResource(R.string.split_mode_custom),
                    selected = mode == SplitMode.Custom,
                    onClick = { mode = SplitMode.Custom; syncPeople(people) },
                    modifier = Modifier.weight(1f),
                )
            }

            when (mode) {
                SplitMode.Equal -> EqualResult(
                    totalNum = totalNum,
                    activeTip = activeTip,
                    grandTotal = grandTotal,
                    perPerson = perPerson,
                    fmt = fmt,
                )
                SplitMode.Custom -> CustomResult(
                    persons = persons,
                    activeTip = activeTip,
                    customGrand = customGrand,
                    fmt = fmt,
                    onNameChange = { id, v -> persons.first { it.id == id }.name = v },
                    onAmountChange = { id, v -> persons.first { it.id == id }.amount = v },
                    onAdd = {
                        persons.add(SplitPerson(nextId.intValue, String.format(defaultNameFmt, persons.size + 1), ""))
                        nextId.intValue++
                    },
                    onRemove = { id -> if (persons.size > MIN_PEOPLE) persons.removeAll { it.id == id } },
                )
            }

            Text(
                text = stringResource(R.string.split_disclaimer),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun EqualResult(
    totalNum: Double,
    activeTip: Double,
    grandTotal: Double,
    perPerson: Double,
    fmt: NumberFormat,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val onColor = MaterialTheme.colorScheme.onPrimaryContainer
        if (totalNum > 0) {
            Text(
                text = stringResource(R.string.split_per_person_label),
                style = MaterialTheme.typography.bodySmall,
                color = onColor,
            )
            Text(
                text = "${fmt.format(perPerson)} đ",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = onColor,
            )
            if (activeTip > 0) {
                Text(
                    text = stringResource(R.string.split_includes_tip, formatTip(activeTip), fmt.format(grandTotal)),
                    style = MaterialTheme.typography.bodySmall,
                    color = onColor,
                    textAlign = TextAlign.Center,
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = TappySpacing.sm),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                BreakdownCell(stringResource(R.string.split_bill_label), fmt.format(totalNum), onColor)
                BreakdownCell(stringResource(R.string.split_tip_short_label), fmt.format(totalNum * activeTip / 100), onColor)
                BreakdownCell(stringResource(R.string.split_total_label), fmt.format(grandTotal), onColor)
            }
        } else {
            Text(
                text = stringResource(R.string.split_empty_prompt),
                style = MaterialTheme.typography.bodySmall,
                color = onColor,
            )
        }
    }
}

@Composable
private fun CustomResult(
    persons: List<SplitPerson>,
    activeTip: Double,
    customGrand: Double,
    fmt: NumberFormat,
    onNameChange: (Int, String) -> Unit,
    onAmountChange: (Int, String) -> Unit,
    onAdd: () -> Unit,
    onRemove: (Int) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        Text(
            text = stringResource(R.string.split_custom_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        persons.forEachIndexed { index, person ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
            ) {
                TappyTextField(
                    value = person.name,
                    onValueChange = { onNameChange(person.id, it) },
                    placeholder = "",
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                TappyTextField(
                    value = person.amount,
                    onValueChange = { onAmountChange(person.id, it) },
                    placeholder = stringResource(R.string.split_amount_placeholder),
                    singleLine = true,
                    keyboardType = KeyboardType.Number,
                    modifier = Modifier.weight(1f),
                )
                if (persons.size > MIN_PEOPLE) {
                    IconButton(onClick = { onRemove(person.id) }) {
                        Icon(
                            imageVector = Icons.Filled.Delete,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
                if (index == persons.lastIndex && persons.size < MAX_PEOPLE) {
                    IconButton(onClick = onAdd) {
                        Icon(
                            imageVector = Icons.Filled.Add,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }

        if (customGrand > 0) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(TappyShapes.card)
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .padding(TappySpacing.xl),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                val onColor = MaterialTheme.colorScheme.onPrimaryContainer
                persons.forEach { person ->
                    val pAmt = person.amount.toDoubleOrNull() ?: 0.0
                    val pShare = pAmt * (1 + activeTip / 100)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(text = person.name, style = MaterialTheme.typography.bodyMedium, color = onColor)
                        Text(text = "${fmt.format(pShare)} đ", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = onColor)
                    }
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = TappySpacing.sm),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(text = stringResource(R.string.split_total_after_tip), style = MaterialTheme.typography.titleSmall, color = onColor)
                    Text(text = "${fmt.format(customGrand)} đ", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = onColor)
                }
            }
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun StepperButton(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(40.dp)
            .clip(TappyShapes.input)
            .background(colors.surfaceVariant),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = colors.onSurfaceVariant)
    }
}

@Composable
private fun SelectableChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .clip(TappyShapes.input)
            .background(if (selected) colors.primary else colors.surfaceVariant)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = if (selected) colors.onPrimary else colors.onSurfaceVariant,
        )
    }
}

@Composable
private fun ModeButton(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = modifier
            .clip(TappyShapes.input)
            .background(if (selected) colors.primary else Color_Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = TappySpacing.sm),
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) colors.onPrimary else colors.onSurfaceVariant,
        )
    }
}

@Composable
private fun BreakdownCell(label: String, value: String, color: androidx.compose.ui.graphics.Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = color)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = color)
        Spacer(Modifier.width(1.dp))
    }
}

/** Formats the active tip for the "includes X% tip" line — whole numbers without a trailing ".0". */
private fun formatTip(tip: Double): String =
    if (tip % 1.0 == 0.0) tip.toInt().toString() else tip.toString()

private val Color_Transparent = androidx.compose.ui.graphics.Color.Transparent
