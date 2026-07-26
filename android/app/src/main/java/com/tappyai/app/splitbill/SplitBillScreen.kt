package com.tappyai.app.splitbill

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tappyai.app.R
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

private data class SplitPerson(val id: Int, val name: String, val amount: String)

private enum class SplitMode { Equal, Custom }

/**
 * Split Bill calculator — an Android port of the web `/split-bill` page. Bill total, people counter
 * (2–20), tip presets + custom, equal/custom split. Pure client math (see [SplitBillCalculator]),
 * no backend.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SplitBillScreen(onBack: () -> Unit) {
    var total by remember { mutableStateOf("") }
    var people by remember { mutableIntStateOf(SplitBillCalculator.MIN_PEOPLE) }
    var tipPreset by remember { mutableIntStateOf(0) }
    var customTip by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(SplitMode.Equal) }
    var persons by remember {
        mutableStateOf(
            (1..SplitBillCalculator.MIN_PEOPLE).map { SplitPerson(it, "", "") },
        )
    }
    var nextId by remember { mutableIntStateOf(SplitBillCalculator.MIN_PEOPLE + 1) }

    val activeTip = SplitBillCalculator.activeTipPercent(tipPreset, customTip)
    val totalNum = SplitBillCalculator.parseAmount(total)
    val grandTotal = SplitBillCalculator.grandTotal(totalNum, activeTip)
    val perPerson = SplitBillCalculator.perPerson(grandTotal, people)
    val defaultNameFor: @Composable (Int) -> String = { stringResource(R.string.splitbill_person_default, it) }

    fun syncPeople(next: Int) {
        val clamped = next.coerceIn(SplitBillCalculator.MIN_PEOPLE, SplitBillCalculator.MAX_PEOPLE)
        people = clamped
        if (mode == SplitMode.Custom) {
            persons = if (clamped > persons.size) {
                persons + (persons.size + 1..clamped).map { SplitPerson(nextId++, "", "") }
            } else {
                persons.take(clamped)
            }
        }
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
                .padding(TappySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(
                    text = "🧮 " + stringResource(R.string.splitbill_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
            }

            // Total + people
            Card {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    FieldLabel(stringResource(R.string.splitbill_total_label))
                    OutlinedTextField(
                        value = total,
                        onValueChange = { total = it },
                        placeholder = { Text(stringResource(R.string.splitbill_total_placeholder)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    FieldLabel(stringResource(R.string.splitbill_people_label))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CounterButton(Icons.Filled.Remove, stringResource(R.string.splitbill_people_decrement)) { syncPeople(people - 1) }
                        Text("$people", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.width(40.dp))
                        CounterButton(Icons.Filled.Add, stringResource(R.string.splitbill_people_increment)) { syncPeople(people + 1) }
                        Text(stringResource(R.string.splitbill_people_unit), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }

            // Tip
            Card {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    FieldLabel(stringResource(R.string.splitbill_tip_label))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                        SplitBillCalculator.TIP_PRESETS.forEach { preset ->
                            val selected = customTip.isBlank() && tipPreset == preset
                            Chip(
                                label = if (preset == 0) stringResource(R.string.splitbill_tip_none) else "$preset%",
                                selected = selected,
                                onClick = { tipPreset = preset; customTip = "" },
                            )
                        }
                        OutlinedTextField(
                            value = customTip,
                            onValueChange = { customTip = it },
                            placeholder = { Text(stringResource(R.string.splitbill_tip_custom_placeholder)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.width(120.dp),
                        )
                    }
                }
            }

            // Mode toggle
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(TappyShapes.pill)
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(TappySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
            ) {
                ModeTab(stringResource(R.string.splitbill_mode_equal), mode == SplitMode.Equal, Modifier.weight(1f)) { mode = SplitMode.Equal }
                ModeTab(stringResource(R.string.splitbill_mode_custom), mode == SplitMode.Custom, Modifier.weight(1f)) {
                    // Entering custom mode reconciles the persons list to the counter.
                    if (persons.size != people) {
                        persons = if (people > persons.size) persons + (persons.size + 1..people).map { SplitPerson(nextId++, "", "") } else persons.take(people)
                    }
                    mode = SplitMode.Custom
                }
            }

            if (mode == SplitMode.Equal) {
                EqualResult(totalNum = totalNum, activeTip = activeTip, grandTotal = grandTotal, perPerson = perPerson)
            } else {
                CustomSplit(
                    persons = persons,
                    activeTip = activeTip,
                    defaultNameFor = defaultNameFor,
                    onUpdate = { id, name, amount -> persons = persons.map { if (it.id == id) it.copy(name = name, amount = amount) else it } },
                    onAdd = { if (persons.size < SplitBillCalculator.MAX_PEOPLE) { persons = persons + SplitPerson(nextId++, "", ""); people = persons.size } },
                    onRemove = { id -> if (persons.size > SplitBillCalculator.MIN_PEOPLE) { persons = persons.filterNot { it.id == id }; people = persons.size } },
                )
            }

            Text(
                text = stringResource(R.string.splitbill_disclaimer),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(TappySpacing.sm),
            )
        }
    }
}

@Composable
private fun EqualResult(totalNum: Double, activeTip: Double, grandTotal: Double, perPerson: Double) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary)))
            .padding(TappySpacing.xl),
    ) {
        if (totalNum > 0) {
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                Text(stringResource(R.string.splitbill_per_person), color = Color.White.copy(alpha = 0.75f), style = MaterialTheme.typography.bodyMedium)
                Text("${formatSplitAmount(perPerson)} đ", color = Color.White, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
                if (activeTip > 0) {
                    Text(
                        stringResource(R.string.splitbill_includes_tip, formatSplitAmount(activeTip), formatSplitAmount(grandTotal)),
                        color = Color.White.copy(alpha = 0.7f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Row(modifier = Modifier.fillMaxWidth().padding(top = TappySpacing.sm), horizontalArrangement = Arrangement.SpaceEvenly) {
                    Stat(stringResource(R.string.splitbill_bill), formatSplitAmount(totalNum))
                    Stat(stringResource(R.string.splitbill_tip_short), formatSplitAmount(SplitBillCalculator.tipAmount(totalNum, activeTip)))
                    Stat(stringResource(R.string.splitbill_grand_total), formatSplitAmount(grandTotal))
                }
            }
        } else {
            Text(stringResource(R.string.splitbill_empty_prompt), color = Color.White.copy(alpha = 0.7f))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CustomSplit(
    persons: List<SplitPerson>,
    activeTip: Double,
    defaultNameFor: @Composable (Int) -> String,
    onUpdate: (Int, String, String) -> Unit,
    onAdd: () -> Unit,
    onRemove: (Int) -> Unit,
) {
    val customTotal = persons.sumOf { SplitBillCalculator.parseAmount(it.amount) }
    Card {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Text(stringResource(R.string.splitbill_custom_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            persons.forEachIndexed { index, p ->
                val name = p.name.ifBlank { defaultNameFor(index + 1) }
                Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = p.name,
                        onValueChange = { onUpdate(p.id, it, p.amount) },
                        placeholder = { Text(defaultNameFor(index + 1)) },
                        singleLine = true,
                        modifier = Modifier.width(110.dp),
                    )
                    OutlinedTextField(
                        value = p.amount,
                        onValueChange = { onUpdate(p.id, p.name, it) },
                        placeholder = { Text(stringResource(R.string.splitbill_amount_placeholder)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    if (persons.size > SplitBillCalculator.MIN_PEOPLE) {
                        IconButton(onClick = { onRemove(p.id) }) {
                            Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.splitbill_remove_person), tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                        }
                    }
                    if (index == persons.lastIndex && persons.size < SplitBillCalculator.MAX_PEOPLE) {
                        IconButton(onClick = onAdd) {
                            Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.splitbill_add_person), tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
            if (customTotal > 0) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(top = TappySpacing.sm),
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                ) {
                    persons.forEachIndexed { index, p ->
                        val share = SplitBillCalculator.personShare(SplitBillCalculator.parseAmount(p.amount), activeTip)
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(p.name.ifBlank { defaultNameFor(index + 1) }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${formatSplitAmount(share)} đ", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(R.string.splitbill_total_after_tip), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        Text("${formatSplitAmount(SplitBillCalculator.grandTotal(customTotal, activeTip))} đ", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            .padding(TappySpacing.lg),
    ) { content() }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun CounterButton(icon: androidx.compose.ui.graphics.vector.ImageVector, contentDescription: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(TappyShapes.input)
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun Chip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .clip(TappyShapes.pill)
            .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
    )
}

@Composable
private fun ModeTab(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Text(
        text = label,
        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier
            .clip(TappyShapes.pill)
            .background(if (selected) MaterialTheme.colorScheme.surface else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = TappySpacing.sm),
    )
}

@Composable
private fun Stat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.labelSmall)
        Text("$value đ", color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
    }
}
