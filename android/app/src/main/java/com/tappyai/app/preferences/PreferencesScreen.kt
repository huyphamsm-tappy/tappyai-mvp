package com.tappyai.app.preferences

import android.widget.Toast
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyButtonSize
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * My Preferences — mirrors the web `/profile/preferences` ("Sở thích của tôi"): an editable form
 * of freeform preferences, gender, budget, favorite cuisines, and dietary restrictions. Loaded and
 * saved by [PreferencesViewModel] via `/api/preferences` (GET on open; Save = PUT structured + POST
 * freeform list, confirmed with a Toast). Option sets are static product constants; `gender` is
 * form-only (the endpoint has no gender field, so it isn't persisted).
 */
@Composable
fun PreferencesScreen(
    onBack: () -> Unit,
    viewModel: PreferencesViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    var newPref by rememberSaveable { mutableStateOf("") }

    // Save outcome is a one-shot event surfaced as a Toast (this screen has no snackbar host).
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            val message = when (event) {
                // Not stringResource() — this runs inside LaunchedEffect's suspend lambda, not a
                // @Composable context; context.getString() resolves the same localized resource.
                PreferencesEvent.Saved -> context.getString(R.string.preferences_saved_toast)
                is PreferencesEvent.SaveFailed -> event.message
            }
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
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
                .padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
                Text(text = stringResource(R.string.preferences_title), style = MaterialTheme.typography.titleLarge)
            }

            InfoBanner()

            FreeformSection(
                preferences = viewModel.preferences,
                newPref = newPref,
                onNewPrefChange = { newPref = it },
                onAdd = { viewModel.addPreference(it); newPref = "" },
                onRemove = viewModel::removePreference,
            )

            GenderSection(selected = viewModel.gender, onToggle = viewModel::toggleGender)
            BudgetSection(selected = viewModel.budget, onToggle = viewModel::toggleBudget)
            CuisineSection(selected = viewModel.cuisines, onToggle = viewModel::toggleCuisine)
            DietarySection(value = viewModel.dietary, onChange = viewModel::onDietaryChange)

            TappyButton(
                text = stringResource(R.string.preferences_save_button),
                onClick = viewModel::save,
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Filled.Save, contentDescription = null, modifier = Modifier.size(18.dp)) },
            )
        }
    }
}

@Composable
private fun InfoBanner() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(TappySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.preferences_info_banner),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FreeformSection(
    preferences: List<String>,
    newPref: String,
    onNewPrefChange: (String) -> Unit,
    onAdd: (String) -> Unit,
    onRemove: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        SectionHeader(
            title = stringResource(R.string.preferences_freeform_title),
            desc = stringResource(R.string.preferences_freeform_desc),
        )

        // Quick-add chips (only those not already added)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
            quickPrefChips().filterNot { it in preferences }.forEach { chip ->
                SuggestionChip(
                    onClick = { onAdd(chip) },
                    label = { Text(stringResource(R.string.preferences_freeform_chip_format, chip)) },
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
            TappyTextField(
                value = newPref,
                onValueChange = onNewPrefChange,
                modifier = Modifier.weight(1f),
                placeholder = stringResource(R.string.preferences_freeform_placeholder),
            )
            TappyButton(
                text = stringResource(R.string.preferences_freeform_add_button),
                onClick = { onAdd(newPref) },
                enabled = newPref.trim().isNotEmpty(),
                size = TappyButtonSize.Small,
                leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(16.dp)) },
            )
        }

        if (preferences.isEmpty()) {
            Text(
                text = stringResource(R.string.preferences_freeform_empty),
                style = MaterialTheme.typography.bodySmall,
                fontStyle = FontStyle.Italic,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                preferences.forEach { pref ->
                    InputChip(
                        selected = true,
                        onClick = { onRemove(pref) },
                        label = { Text(pref) },
                        trailingIcon = {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = stringResource(R.string.preferences_freeform_remove_content_description, pref),
                                modifier = Modifier.size(16.dp),
                            )
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun GenderSection(selected: Gender?, onToggle: (Gender) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        SectionHeader(
            title = stringResource(R.string.preferences_gender_title),
            desc = stringResource(R.string.preferences_gender_desc),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            genderOptions().forEach { option ->
                SelectableOptionCard(
                    emoji = option.emoji,
                    label = option.label,
                    desc = null,
                    selected = selected == option.gender,
                    vertical = false,
                    onClick = { onToggle(option.gender) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun BudgetSection(selected: BudgetLevel?, onToggle: (BudgetLevel) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        SectionHeader(title = stringResource(R.string.preferences_budget_title))
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            budgetOptions().forEach { option ->
                SelectableOptionCard(
                    emoji = option.emoji,
                    label = option.label,
                    desc = option.desc,
                    selected = selected == option.level,
                    vertical = true,
                    onClick = { onToggle(option.level) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CuisineSection(selected: Set<String>, onToggle: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        SectionHeader(title = stringResource(R.string.preferences_cuisine_title))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm), verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
            cuisineOptions().forEach { item ->
                FilterChip(
                    selected = item in selected,
                    onClick = { onToggle(item) },
                    label = { Text(item) },
                )
            }
        }
    }
}

@Composable
private fun DietarySection(value: String, onChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        SectionHeader(
            title = stringResource(R.string.preferences_dietary_title),
            desc = stringResource(R.string.preferences_dietary_desc),
        )
        TappyTextField(
            value = value,
            onValueChange = onChange,
            placeholder = stringResource(R.string.preferences_dietary_placeholder),
            singleLine = false,
            minLines = 3,
            maxLines = 5,
        )
    }
}

@Composable
private fun SectionHeader(title: String, desc: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
        Text(text = title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        if (desc != null) {
            Text(text = desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * Feature-private selectable option card (budget / gender) — a bordered card with an emoji, label,
 * optional [desc], and a check when [selected]. [vertical] stacks emoji/label/desc (budget) vs a
 * single row (gender). Not a design-system component yet: only this feature uses it (per the
 * approved decision).
 */
@Composable
private fun SelectableOptionCard(
    emoji: String,
    label: String,
    desc: String?,
    selected: Boolean,
    vertical: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val borderColor = if (selected) colors.primary else colors.outlineVariant
    val background = if (selected) colors.primaryContainer else colors.surface
    val labelColor = if (selected) colors.primary else colors.onSurface

    val base = modifier
        .clip(TappyShapes.card)
        .border(2.dp, borderColor, TappyShapes.card)
        .background(background)
        .clickable(onClick = onClick)

    if (vertical) {
        Column(
            modifier = base.padding(TappySpacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        ) {
            Text(text = emoji, fontSize = 24.sp)
            Text(text = label, style = MaterialTheme.typography.labelLarge, color = labelColor, textAlign = TextAlign.Center)
            if (desc != null) {
                Text(text = desc, style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant, textAlign = TextAlign.Center)
            }
            if (selected) Icon(Icons.Filled.Check, contentDescription = null, tint = colors.primary, modifier = Modifier.size(14.dp))
        }
    } else {
        Row(
            modifier = base.padding(vertical = TappySpacing.lg, horizontal = TappySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = emoji, fontSize = 20.sp)
            Text(text = label, style = MaterialTheme.typography.labelLarge, color = labelColor)
            if (selected) Icon(Icons.Filled.Check, contentDescription = null, tint = colors.primary, modifier = Modifier.size(14.dp))
        }
    }
}
