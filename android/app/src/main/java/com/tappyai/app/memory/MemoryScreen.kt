package com.tappyai.app.memory

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Schedule
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonVariant
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.theme.TappyCategoryColor
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyMinTouchTarget
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.tappyCategoryColors

/**
 * What Tappy Knows — mirrors the web `/profile/tappy-knows`: response-style control, a fact-count
 * banner, per-category memory cards (area, companions, timing, style, food, leisure, shopping,
 * avoid, budget, history), inline edit mode (per-tag ✕), and a two-step clear. Data is loaded by
 * [MemoryViewModel] from `/api/memory`; each edit/remove persists via PATCH and clear via DELETE
 * (see [MemoryViewModel]). Category hues come from the design
 * system's `tappyCategoryColors` (no hex here). Reached from both Profile → What Tappy knows and
 * Settings → Memory; [onStartChat] switches to the Chat tab from the empty state.
 */
@Composable
fun MemoryScreen(
    onBack: () -> Unit,
    onStartChat: () -> Unit,
    viewModel: MemoryViewModel = hiltViewModel(),
) {
    val memory = viewModel.memory
    val editing = viewModel.editing

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
            Header(
                showEdit = memory != null,
                editing = editing,
                onBack = onBack,
                onToggleEdit = viewModel::toggleEditing,
                onRefresh = viewModel::refresh,
            )

            ResponseStyleCard(
                tone = viewModel.tone,
                length = viewModel.length,
                onTone = viewModel::selectTone,
                onLength = viewModel::selectLength,
            )

            if (memory == null) {
                EmptyState(cleared = viewModel.cleared, onStartChat = onStartChat)
            } else {
                MemoryContent(memory = memory, editing = editing, viewModel = viewModel)
            }
        }
    }
}

@Composable
private fun Header(
    showEdit: Boolean,
    editing: Boolean,
    onBack: () -> Unit,
    onToggleEdit: () -> Unit,
    onRefresh: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = stringResource(R.string.memory_title), style = MaterialTheme.typography.titleLarge)
            Text(
                text = stringResource(R.string.memory_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (showEdit) {
            FilterChip(
                selected = editing,
                onClick = onToggleEdit,
                label = { Text(if (editing) stringResource(R.string.memory_done) else stringResource(R.string.memory_edit)) },
                leadingIcon = {
                    Icon(
                        imageVector = if (editing) Icons.Filled.Check else Icons.Filled.Edit,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                },
            )
        }
        IconButton(onClick = onRefresh) {
            Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.memory_refresh_cd))
        }
    }
}

@Composable
private fun ResponseStyleCard(
    tone: ResponseTone?,
    length: ResponseLength?,
    onTone: (ResponseTone) -> Unit,
    onLength: (ResponseLength) -> Unit,
) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            CardLabel(icon = Icons.Filled.AutoAwesome, label = stringResource(R.string.memory_response_style_label), iconColor = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.memory_tone_label), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                FilterChip(selected = tone == ResponseTone.Friendly, onClick = { onTone(ResponseTone.Friendly) }, label = { Text(ResponseTone.Friendly.label()) })
                FilterChip(selected = tone == ResponseTone.Neutral, onClick = { onTone(ResponseTone.Neutral) }, label = { Text(ResponseTone.Neutral.label()) })
                FilterChip(selected = tone == ResponseTone.Formal, onClick = { onTone(ResponseTone.Formal) }, label = { Text(ResponseTone.Formal.label()) })
            }
            Text(stringResource(R.string.memory_length_label), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                FilterChip(selected = length == ResponseLength.Short, onClick = { onLength(ResponseLength.Short) }, label = { Text(ResponseLength.Short.label()) })
                FilterChip(selected = length == ResponseLength.Detailed, onClick = { onLength(ResponseLength.Detailed) }, label = { Text(ResponseLength.Detailed.label()) })
            }
            Text(
                text = stringResource(R.string.memory_response_style_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun EmptyState(cleared: Boolean, onStartChat: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = TappySpacing.huge),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        Icon(
            imageVector = Icons.Filled.Psychology,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(44.dp),
        )
        Text(
            text = if (cleared) stringResource(R.string.memory_cleared_title) else stringResource(R.string.memory_empty_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = stringResource(R.string.memory_empty_message),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TappyButton(text = stringResource(R.string.memory_start_chat), onClick = onStartChat)
    }
}

@Composable
private fun MemoryContent(memory: Memory, editing: Boolean, viewModel: MemoryViewModel) {
    val cat = tappyCategoryColors
    val prefs = memory.preferences

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        FactCountBanner(count = memory.factCount())

        memory.locationBase?.let {
            MemoryCard(icon = Icons.Filled.Place, label = stringResource(R.string.memory_label_area), iconColor = cat.blue.accent) {
                FieldValue(text = it, editing = editing, onRemove = viewModel::removeLocation, removeLabel = stringResource(R.string.memory_remove_area_cd))
            }
        }

        if (memory.companions != null || memory.timing != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                memory.companions?.let {
                    Box(modifier = Modifier.weight(1f)) {
                        MemoryCard(icon = Icons.Filled.Group, label = stringResource(R.string.memory_label_usually_with), iconColor = cat.purple.accent) {
                            FieldValue(text = it, editing = editing, onRemove = viewModel::removeCompanions, removeLabel = stringResource(R.string.memory_remove_cd))
                        }
                    }
                }
                memory.timing?.let {
                    Box(modifier = Modifier.weight(1f)) {
                        MemoryCard(icon = Icons.Filled.Schedule, label = stringResource(R.string.memory_label_usual_timing), iconColor = cat.amber.accent) {
                            FieldValue(text = it, editing = editing, onRemove = viewModel::removeTiming, removeLabel = stringResource(R.string.memory_remove_cd))
                        }
                    }
                }
            }
        }

        memory.personality?.let {
            MemoryCard(icon = Icons.Filled.AutoAwesome, label = stringResource(R.string.memory_label_style), iconColor = cat.pink.accent) {
                FieldValue(text = it, editing = editing, onRemove = viewModel::removePersonality, removeLabel = stringResource(R.string.memory_remove_style_cd))
            }
        }

        if (prefs.food.isNotEmpty()) {
            MemoryCard(icon = Icons.Filled.Restaurant, label = stringResource(R.string.memory_label_favorite_food), iconColor = cat.orange.accent) {
                TagFlow(items = prefs.food, color = cat.orange, editing = editing, onRemove = viewModel::removeFood)
            }
        }

        if (prefs.spa.isNotEmpty() || prefs.entertainment.isNotEmpty()) {
            MemoryCard(icon = Icons.Filled.Favorite, label = stringResource(R.string.memory_label_leisure), iconColor = cat.pink.accent) {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    if (prefs.spa.isNotEmpty()) {
                        SubLabel(stringResource(R.string.memory_sublabel_spa))
                        TagFlow(items = prefs.spa, color = cat.purple, editing = editing, onRemove = viewModel::removeSpa)
                    }
                    if (prefs.entertainment.isNotEmpty()) {
                        SubLabel(stringResource(R.string.memory_sublabel_entertainment))
                        TagFlow(items = prefs.entertainment, color = cat.blue, editing = editing, onRemove = viewModel::removeEntertainment)
                    }
                }
            }
        }

        if (prefs.shopping.isNotEmpty()) {
            MemoryCard(icon = Icons.Filled.AutoAwesome, label = stringResource(R.string.memory_label_shopping), iconColor = cat.green.accent) {
                TagFlow(items = prefs.shopping, color = cat.green, editing = editing, onRemove = viewModel::removeShopping)
            }
        }

        if (prefs.avoid.isNotEmpty()) {
            MemoryCard(icon = Icons.Filled.Restaurant, label = stringResource(R.string.memory_label_dislikes), iconColor = cat.red.accent) {
                TagFlow(items = prefs.avoid, color = cat.red, editing = editing, onRemove = viewModel::removeAvoid)
            }
        }

        if (memory.budget.isNotEmpty()) {
            MemoryCard(icon = Icons.Filled.AutoAwesome, label = stringResource(R.string.memory_label_usual_budget), iconColor = cat.green.accent) {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                    memory.budget.forEach { item ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = item.category.replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = formatBudget(item),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                if (editing) {
                                    RemoveIcon(label = stringResource(R.string.memory_remove_budget_cd, item.category)) { viewModel.removeBudget(item.category) }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (memory.history.isNotEmpty()) {
            MemoryCard(icon = Icons.Filled.Schedule, label = stringResource(R.string.memory_label_topics), iconColor = MaterialTheme.colorScheme.onSurfaceVariant) {
                val recent = memory.history.takeLast(8).reversed()
                FlowRowTags {
                    recent.forEach { topic ->
                        MemoryTag(
                            text = topic,
                            containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            editing = editing,
                            onRemove = { viewModel.removeHistory(topic) },
                        )
                    }
                }
            }
        }

        ClearMemorySection(onClear = viewModel::clear)
    }
}

@Composable
private fun FactCountBanner(count: Int) {
    val onGradient = MaterialTheme.colorScheme.onPrimary
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary)))
            .padding(TappySpacing.lg),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(TappyShapes.card)
                    .background(onGradient.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Psychology, contentDescription = null, tint = onGradient, modifier = Modifier.size(24.dp))
            }
            Column {
                Text(
                    text = stringResource(R.string.memory_fact_count, count),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = onGradient,
                )
                Text(
                    text = stringResource(R.string.memory_fact_count_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = onGradient.copy(alpha = 0.8f),
                )
            }
        }
    }
}

@Composable
private fun MemoryCard(icon: ImageVector, label: String, iconColor: Color, content: @Composable () -> Unit) {
    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
            CardLabel(icon = icon, label = label, iconColor = iconColor)
            content()
        }
    }
}

@Composable
private fun CardLabel(icon: ImageVector, label: String, iconColor: Color) {
    Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(15.dp))
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SubLabel(text: String) {
    Text(text = text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun FieldValue(text: String, editing: Boolean, onRemove: () -> Unit, removeLabel: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = text, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f, fill = false))
        if (editing) RemoveIcon(label = removeLabel, onClick = onRemove)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagFlow(items: List<String>, color: TappyCategoryColor, editing: Boolean, onRemove: (Int) -> Unit) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        items.forEachIndexed { index, tag ->
            MemoryTag(
                text = tag,
                containerColor = color.container,
                contentColor = color.onContainer,
                editing = editing,
                onRemove = { onRemove(index) },
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowTags(content: @Composable () -> Unit) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) { content() }
}

@Composable
private fun MemoryTag(text: String, containerColor: Color, contentColor: Color, editing: Boolean, onRemove: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(TappyShapes.pill)
            .background(containerColor)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = text, style = MaterialTheme.typography.labelMedium, color = contentColor)
        if (editing) {
            IconButton(onClick = onRemove, modifier = Modifier.size(TappyMinTouchTarget)) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.memory_remove_tag_cd, text),
                    tint = contentColor,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun RemoveIcon(label: String, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(TappyMinTouchTarget)) {
        Icon(
            imageVector = Icons.Filled.Close,
            contentDescription = label,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
    }
}

@Composable
private fun ClearMemorySection(onClear: () -> Unit) {
    var confirming by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme

    TappyCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Text(stringResource(R.string.memory_clear_title), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = colors.onSurface)
            Text(
                text = stringResource(R.string.memory_clear_message),
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant,
            )
            if (confirming) {
                Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                    TappyButton(
                        text = stringResource(R.string.memory_clear_confirm),
                        onClick = { onClear(); confirming = false },
                        modifier = Modifier.weight(1f),
                        variant = TappyButtonVariant.Destructive,
                        leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    )
                    TappyButton(
                        text = stringResource(R.string.memory_clear_cancel),
                        onClick = { confirming = false },
                        modifier = Modifier.weight(1f),
                        variant = TappyButtonVariant.Secondary,
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .clip(TappyShapes.input)
                        .border(1.dp, colors.error, TappyShapes.input)
                        .clickable { confirming = true }
                        .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.md),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Delete, contentDescription = null, tint = colors.error, modifier = Modifier.size(16.dp))
                        Text(stringResource(R.string.memory_clear_cta), style = MaterialTheme.typography.bodyMedium, color = colors.error)
                    }
                }
            }
        }
    }
}
