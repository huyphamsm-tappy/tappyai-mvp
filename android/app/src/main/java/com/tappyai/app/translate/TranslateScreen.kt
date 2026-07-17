package com.tappyai.app.translate

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * Translate — mirrors the web `/translate` page: a bounded text input, a 30-language target
 * picker, a translate call to the existing `POST /api/translate` (server-side AI, no client
 * business logic), then read-aloud (device TTS) + copy on the result. No sign-in required, same
 * as the web (the endpoint rate-limits by IP, not by user). Reached from Home's "Translate" quick
 * action, replacing its former coming-soon sheet.
 */
@Composable
fun TranslateScreen(
    onBack: () -> Unit,
    viewModel: TranslateViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    var showLanguagePicker by remember { mutableStateOf(false) }

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
                Text(text = stringResource(R.string.translate_title), style = MaterialTheme.typography.titleLarge)
            }

            HeroBanner()

            InputCard(
                text = viewModel.inputText,
                onTextChange = viewModel::onInputTextChange,
                onClear = viewModel::clear,
            )

            TargetLanguagePicker(
                selected = viewModel.targetLanguage,
                onOpenPicker = { showLanguagePicker = true },
            )

            TappyButton(
                text = if (viewModel.isTranslating) stringResource(R.string.translate_action_translating) else stringResource(R.string.translate_action_translate),
                onClick = viewModel::translate,
                enabled = viewModel.inputText.isNotBlank(),
                loading = viewModel.isTranslating,
                modifier = Modifier.fillMaxWidth(),
            )

            viewModel.errorMessage?.let { ErrorBanner(it) }

            viewModel.translation?.let { translation ->
                ResultCard(
                    translation = translation,
                    languageName = viewModel.targetLanguage.displayName(),
                    isSpeaking = viewModel.isSpeaking,
                    ttsAvailable = viewModel.ttsAvailable,
                    onReadAloud = { viewModel.speak(translation, viewModel.targetLanguage.ttsTag) },
                    onCopy = { copyToClipboard(context, translation) },
                )
            }

            Text(
                text = stringResource(R.string.translate_footer_note),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }

    if (showLanguagePicker) {
        LanguagePickerSheet(
            selectedCode = viewModel.targetLanguage.code,
            onSelect = { language ->
                viewModel.onTargetLanguageChange(language)
                showLanguagePicker = false
            },
            onDismiss = { showLanguagePicker = false },
        )
    }
}

@Composable
private fun HeroBanner() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
    ) {
        Text(text = "🌐", style = MaterialTheme.typography.headlineMedium)
        Text(
            text = stringResource(R.string.translate_hero_title),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Text(
            text = stringResource(R.string.translate_hero_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

@Composable
private fun InputCard(text: String, onTextChange: (String) -> Unit, onClear: () -> Unit) {
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Text(
                text = stringResource(R.string.translate_input_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TappyTextField(
                value = text,
                onValueChange = onTextChange,
                placeholder = stringResource(R.string.translate_input_placeholder),
                singleLine = false,
                minLines = 5,
                maxLines = 5,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.translate_char_counter, text.length),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (text.isNotBlank()) {
                    Text(
                        text = stringResource(R.string.translate_clear),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clickable(onClick = onClear),
                    )
                }
            }
        }
    }
}

@Composable
private fun TargetLanguagePicker(selected: Language, onOpenPicker: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        Text(
            text = stringResource(R.string.translate_target_label),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TappyCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onOpenPicker)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = selected.displayName(), style = MaterialTheme.typography.bodyLarge)
                Icon(
                    imageVector = Icons.Filled.ExpandMore,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun LanguagePickerSheet(
    selectedCode: String,
    onSelect: (Language) -> Unit,
    onDismiss: () -> Unit,
) {
    com.tappyai.core.designsystem.component.TappyBottomSheet(onDismiss = onDismiss) {
        // heightIn(max=), not a fixed height() — see CurrencyScreen's identical picker sheet fix.
        LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
            items(LANGUAGES) { language ->
                val isSelected = language.code == selectedCode
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(language) }
                        .padding(vertical = TappySpacing.md),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = language.displayName(),
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (isSelected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                    if (isSelected) {
                        Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = stringResource(R.string.translate_selected_description),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.card)
            .background(MaterialTheme.colorScheme.errorContainer)
            .padding(TappySpacing.lg),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onErrorContainer,
        )
    }
}

@Composable
private fun ResultCard(
    translation: String,
    languageName: String,
    isSpeaking: Boolean,
    ttsAvailable: Boolean,
    onReadAloud: () -> Unit,
    onCopy: () -> Unit,
) {
    var copied by remember { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(copied) {
        if (copied) {
            delay(2000)
            copied = false
        }
    }
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            Text(
                text = stringResource(R.string.translate_result_header, languageName),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(text = translation, style = MaterialTheme.typography.bodyLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
                if (ttsAvailable) {
                    AssistChip(
                        label = if (isSpeaking) stringResource(R.string.translate_action_stop) else stringResource(R.string.translate_action_read_aloud),
                        icon = if (isSpeaking) Icons.Filled.VolumeOff else Icons.Filled.VolumeUp,
                        onClick = onReadAloud,
                    )
                }
                AssistChip(
                    label = if (copied) stringResource(R.string.translate_action_copied) else stringResource(R.string.translate_action_copy),
                    icon = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                    onClick = {
                        onCopy()
                        copied = true
                    },
                )
            }
        }
    }
}

@Composable
private fun AssistChip(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .clickable(onClick = onClick)
            .background(MaterialTheme.colorScheme.surfaceVariant, TappyShapes.input)
            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(2.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("Translation", text))
}
