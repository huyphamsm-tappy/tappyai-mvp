package com.tappyai.app.vietwriter

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.vietwriter.data.VietWriterResult
import com.tappyai.core.designsystem.component.TappyButton
import com.tappyai.core.designsystem.component.TappyCard
import com.tappyai.core.designsystem.component.TappyTextField
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * VietWriter — mirrors the web `/viet-content` page: a topic input, platform/tone/length
 * selectors, a generate call to the existing `POST /api/viet-content` (server-side AI, no client
 * business logic), then a result card with Copy/Copy-all/Rewrite. No sign-in required, same as
 * Translate/Scan. Reached from Home's "Content writer" card.
 */
@Composable
fun VietWriterScreen(
    onBack: () -> Unit,
    viewModel: VietWriterViewModel = hiltViewModel(),
) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
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
                Text(text = stringResource(R.string.vietwriter_title), style = MaterialTheme.typography.titleLarge)
            }

            TopicCard(topic = viewModel.topic, onTopicChange = viewModel::onTopicChange)
            PlatformSection(selected = viewModel.platform, onSelect = viewModel::onPlatformChange)
            ToneSection(selected = viewModel.tone, onSelect = viewModel::onToneChange)
            LengthSection(selected = viewModel.length, onSelect = viewModel::onLengthChange)

            TappyButton(
                text = if (viewModel.isGenerating) stringResource(R.string.vietwriter_generating) else stringResource(R.string.vietwriter_generate),
                onClick = viewModel::generate,
                enabled = viewModel.topic.isNotBlank(),
                loading = viewModel.isGenerating,
                modifier = Modifier.fillMaxWidth(),
            )

            viewModel.errorMessage?.let { ErrorBanner(it) }

            viewModel.result?.let { result ->
                ResultSection(
                    result = result,
                    onCopyCaption = { copyToClipboard(context, result.caption) },
                    onCopyAll = { copyToClipboard(context, "${result.caption}\n\n${result.hashtags}") },
                    onRewrite = viewModel::onReset,
                )
            }
        }
    }
}

@Composable
private fun TopicCard(topic: String, onTopicChange: (String) -> Unit) {
    TappyCard {
        Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            Text(
                text = stringResource(R.string.vietwriter_topic_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TappyTextField(
                value = topic,
                onValueChange = onTopicChange,
                placeholder = stringResource(R.string.vietwriter_topic_placeholder),
                singleLine = false,
                minLines = 3,
                maxLines = 5,
            )
            Text(
                text = stringResource(R.string.vietwriter_char_counter, topic.length),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.End,
            )
        }
    }
}

@Composable
private fun PlatformSection(selected: VietWriterPlatform, onSelect: (VietWriterPlatform) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        Text(
            text = stringResource(R.string.vietwriter_platform_label),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            VietWriterPlatform.entries.forEach { option ->
                val isSelected = option == selected
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(TappyShapes.card)
                        .background(if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { onSelect(option) }
                        .padding(vertical = TappySpacing.md),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                ) {
                    Text(text = option.emoji, style = MaterialTheme.typography.titleMedium)
                    Text(
                        text = option.label(),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun ToneSection(selected: VietWriterTone, onSelect: (VietWriterTone) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        Text(
            text = stringResource(R.string.vietwriter_tone_label),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            items(VietWriterTone.entries.toList()) { option ->
                val isSelected = option == selected
                Text(
                    text = option.label(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isSelected) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .clip(TappyShapes.pill)
                        .background(if (isSelected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { onSelect(option) }
                        .padding(horizontal = TappySpacing.lg, vertical = TappySpacing.sm),
                )
            }
        }
    }
}

@Composable
private fun LengthSection(selected: VietWriterLength, onSelect: (VietWriterLength) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        Text(
            text = stringResource(R.string.vietwriter_length_label),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            VietWriterLength.entries.forEach { option ->
                val isSelected = option == selected
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(TappyShapes.card)
                        .background(if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { onSelect(option) }
                        .padding(vertical = TappySpacing.md, horizontal = TappySpacing.xs),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = option.label(),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = option.hint(),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
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
        Text(text = message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
    }
}

@Composable
private fun ResultSection(
    result: VietWriterResult,
    onCopyCaption: () -> Unit,
    onCopyAll: () -> Unit,
    onRewrite: () -> Unit,
) {
    var copiedCaption by remember { mutableStateOf(false) }
    var copiedAll by remember { mutableStateOf(false) }
    LaunchedEffect(copiedCaption) { if (copiedCaption) { delay(2000); copiedCaption = false } }
    LaunchedEffect(copiedAll) { if (copiedAll) { delay(2000); copiedAll = false } }

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        TappyCard {
            Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.vietwriter_result_title),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Row(
                        modifier = Modifier
                            .clickable { onCopyCaption(); copiedCaption = true }
                            .background(MaterialTheme.colorScheme.surfaceVariant, TappyShapes.input)
                            .padding(horizontal = TappySpacing.md, vertical = TappySpacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = if (copiedCaption) Icons.Filled.Check else Icons.Filled.ContentCopy,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp),
                        )
                        Text(
                            text = if (copiedCaption) stringResource(R.string.vietwriter_copied) else stringResource(R.string.vietwriter_copy),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(text = result.caption, style = MaterialTheme.typography.bodyLarge)
            }
        }

        if (result.hashtags.isNotBlank()) {
            TappyCard {
                Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.xs)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Tag, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                        Text(
                            text = stringResource(R.string.vietwriter_hashtags_title),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(text = result.hashtags, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            TappyButton(
                text = if (copiedAll) stringResource(R.string.vietwriter_copied_all) else stringResource(R.string.vietwriter_copy_all),
                onClick = { onCopyAll(); copiedAll = true },
                modifier = Modifier.weight(1f),
                leadingIcon = { Icon(Icons.Filled.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp)) },
            )
            TappyButton(
                text = stringResource(R.string.vietwriter_rewrite),
                onClick = onRewrite,
                modifier = Modifier.weight(1f),
                leadingIcon = { Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp)) },
            )
        }
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("TappyAI", text))
}
