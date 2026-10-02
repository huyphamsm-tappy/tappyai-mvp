package com.tappyai.app.splitbill

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.CallSplit
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material.icons.filled.Percent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import com.tappyai.app.home.HomeV3
import com.tappyai.app.tools.ToolCard
import com.tappyai.app.tools.ToolChip
import com.tappyai.app.tools.ToolCoin
import com.tappyai.app.tools.ToolHero
import com.tappyai.app.tools.ToolHue
import com.tappyai.app.tools.ToolSegment
import com.tappyai.app.tools.ToolTextField
import com.tappyai.app.tools.ToolV3Page
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
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

/** The hero scene: a calculator plate and three coins, as on the web (the subtitle is the body line). */
@Composable
private fun BoxScope.SplitScene() {
    Column(
        modifier = Modifier
            .align(Alignment.TopEnd)
            .offset(x = (-24).dp, y = 6.dp)
            .size(96.dp, 118.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFF14124A))
            .border(1.dp, Color(0x5993C5FD), RoundedCornerShape(14.dp))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(22.dp).clip(RoundedCornerShape(6.dp)).background(Color(0xFF0A1233)))
        repeat(3) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                repeat(3) { Box(modifier = Modifier.size(20.dp).clip(RoundedCornerShape(5.dp)).background(Color(0x2EFFFFFF))) }
            }
        }
    }
    ToolCoin(symbol = "$", a = Color(0xFFF59E0B), b = Color(0xFFFBBF24), alignment = Alignment.TopStart, size = 40.dp, modifier = Modifier.offset(x = 10.dp, y = 22.dp))
    ToolCoin(symbol = "$", a = Color(0xFFF59E0B), b = Color(0xFFFBBF24), alignment = Alignment.CenterStart, size = 30.dp, modifier = Modifier.offset(x = 2.dp, y = 4.dp))
    ToolCoin(symbol = "$", a = Color(0xFFF59E0B), b = Color(0xFFFBBF24), alignment = Alignment.BottomStart, size = 34.dp, modifier = Modifier.offset(x = 22.dp, y = (-6).dp))
}

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

    ToolV3Page(onBack = onBack) {
        ToolHero(
            hue = ToolHue.Navy,
            eyebrow = stringResource(R.string.tool_split_eyebrow),
            title1 = stringResource(R.string.split_title),
            title2 = null,
            body = stringResource(R.string.tool_split_subtitle),
            chips = listOf(
                ToolChip(Icons.Filled.Group, stringResource(R.string.tool_split_chip_people, MIN_PEOPLE, MAX_PEOPLE)),
                ToolChip(Icons.Filled.Percent, stringResource(R.string.tool_split_chip_tip)),
                ToolChip(Icons.Filled.CallSplit, stringResource(R.string.tool_split_chip_modes)),
            ),
            mascotRes = R.drawable.tappy_wave,
            scene = { SplitScene() },
        )

        // ── Total ──
        ToolCard(title = stringResource(R.string.split_bill_total_label), icon = Icons.Filled.Paid) {
            ToolTextField(
                value = total,
                onValueChange = { total = it },
                placeholder = stringResource(R.string.split_bill_total_placeholder),
                singleLine = true,
                keyboardType = KeyboardType.Number,
                textSize = 26.sp,
                trailingIcon = { Text(text = "₫", color = HomeV3.OnSurfaceVariant, fontSize = 18.sp, fontWeight = FontWeight.Bold) },
            )
        }

        // ── People (the web stepper: two 48dp discs around a 24sp count) ──
        ToolCard(title = stringResource(R.string.split_people_label), icon = Icons.Filled.Group) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
            ) {
                StepperButton(icon = Icons.Filled.Remove, onClick = { syncPeople((people - 1).coerceAtLeast(MIN_PEOPLE)) })
                Text(
                    text = people.toString(),
                    fontSize = 24.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = HomeV3.OnSurface,
                )
                StepperButton(icon = Icons.Filled.Add, onClick = { syncPeople((people + 1).coerceAtMost(MAX_PEOPLE)) })
                Text(text = stringResource(R.string.split_people_unit), color = HomeV3.OnSurfaceVariant, fontSize = 14.sp)
            }
        }

        // ── Tip: presets as segments + the custom field ──
        ToolCard(title = stringResource(R.string.split_tip_label), icon = Icons.Filled.Percent) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                TIP_PRESETS.forEach { preset ->
                    ToolSegment(
                        text = if (preset == 0) stringResource(R.string.split_tip_none) else "$preset%",
                        selected = customTip.isBlank() && tip == preset,
                        onClick = { tip = preset; customTip = "" },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            ToolTextField(
                value = customTip,
                onValueChange = { customTip = it; tip = -1 },
                placeholder = stringResource(R.string.split_tip_custom_placeholder),
                singleLine = true,
                keyboardType = KeyboardType.Number,
                trailingIcon = { Text(text = "%", color = HomeV3.OnSurfaceVariant, fontSize = 16.sp, fontWeight = FontWeight.Bold) },
            )
        }

        // ── Mode: the web's two 52dp radio segments ──
        ToolCard(title = stringResource(R.string.split_mode_equal) + " / " + stringResource(R.string.split_mode_custom), icon = Icons.Filled.CallSplit) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                ToolSegment(
                    text = stringResource(R.string.split_mode_equal),
                    selected = mode == SplitMode.Equal,
                    onClick = { mode = SplitMode.Equal },
                    minHeight = 52.dp,
                    modifier = Modifier.weight(1f),
                )
                ToolSegment(
                    text = stringResource(R.string.split_mode_custom),
                    selected = mode == SplitMode.Custom,
                    onClick = { mode = SplitMode.Custom; syncPeople(people) },
                    minHeight = 52.dp,
                    modifier = Modifier.weight(1f),
                )
            }
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

@Composable
private fun EqualResult(
    totalNum: Double,
    activeTip: Double,
    grandTotal: Double,
    perPerson: Double,
    fmt: NumberFormat,
) {
    val shape = RoundedCornerShape(24.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(14.dp, shape, ambientColor = Color(0x733B82F6), spotColor = Color(0x733B82F6))
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF2563EB), Color(0xFF4F46E5), Color(0xFF6D28D9))))
            .border(1.dp, Color(0x5993C5FD), shape)
            .padding(TappySpacing.xxl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val onColor = Color.White
        if (totalNum > 0) {
            Text(
                text = stringResource(R.string.split_per_person_label).uppercase(),
                color = Color(0xFFBFDBFE),
                fontSize = 12.5.sp,
                letterSpacing = 1.2.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "${fmt.format(perPerson)} đ",
                fontSize = 40.sp,
                lineHeight = 46.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-0.5).sp,
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
                ToolTextField(
                    value = person.name,
                    onValueChange = { onNameChange(person.id, it) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                ToolTextField(
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
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(HomeV3.SurfaceVariant)
            .border(1.dp, HomeV3.Outline, CircleShape),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = HomeV3.OnSurface)
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
