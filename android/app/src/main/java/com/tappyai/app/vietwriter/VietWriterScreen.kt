package com.tappyai.app.vietwriter

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.tools.ToolButton
import com.tappyai.app.tools.ToolCard
import com.tappyai.app.tools.ToolCta
import com.tappyai.app.tools.ToolError
import com.tappyai.app.tools.ToolHue
import com.tappyai.app.tools.ToolSegment
import com.tappyai.app.tools.ToolTextField
import com.tappyai.app.tools.ToolV3Page
import com.tappyai.app.vietwriter.data.VietWriterResult
import com.tappyai.core.designsystem.theme.TappySpacing
import kotlinx.coroutines.delay

/**
 * VietWriter — the web `/viet-content` page (design/v3-phase4 `VietContentView` +
 * `VietContentForm`), native on the V3 ground: the pink→rose→orange hero (48dp reading pose,
 * kicker, two-line title, subtitle, the two white/10 discs), then one form card — topic textarea
 * with counter, the three platform tiles (emoji + name), the tone pills, the three length tiles
 * (name + hint) — the gradient CTA, the error panel, and the result: caption card with the
 * platform emoji and Copy, the hashtag card, then Copy-all / Rewrite.
 *
 * Behaviour is exactly what it was: a bounded topic, platform/tone/length selectors, one call to
 * the existing `POST /api/viet-content` (server-side AI, no client business logic), then
 * clipboard copy and a reset. No sign-in required, same as Translate/Scan.
 */
@Composable
fun VietWriterScreen(
    onBack: () -> Unit,
    viewModel: VietWriterViewModel = hiltViewModel(),
) {
    val context = LocalContext.current

    ToolV3Page(onBack = onBack) {
        VietHero()

        ToolCard {
            TopicField(topic = viewModel.topic, onTopicChange = viewModel::onTopicChange)
            PlatformSection(selected = viewModel.platform, onSelect = viewModel::onPlatformChange)
            ToneSection(selected = viewModel.tone, onSelect = viewModel::onToneChange)
            LengthSection(selected = viewModel.length, onSelect = viewModel::onLengthChange)
        }

        ToolCta(
            text = if (viewModel.isGenerating) stringResource(R.string.vietwriter_generating) else stringResource(R.string.vietwriter_generate),
            hue = ToolHue.Pink,
            icon = Icons.Filled.AutoAwesome,
            onClick = viewModel::generate,
            enabled = viewModel.topic.isNotBlank(),
            loading = viewModel.isGenerating,
        )

        viewModel.errorMessage?.let { ToolError(it) }

        viewModel.result?.let { result ->
            ResultSection(
                result = result,
                platformEmoji = viewModel.platform.emoji,
                onCopyCaption = { copyToClipboard(context, result.caption) },
                onCopyAll = { copyToClipboard(context, "${result.caption}\n\n${result.hashtags}") },
                onRewrite = viewModel::onReset,
            )
        }
    }
}

/**
 * The hero, as on the web: a 24dp-radius pink→rose→orange sweep with a white/10 disc top-right
 * and a blurred one bottom-left, the 48dp mascot tile, the kicker, the two-line black title and
 * the subtitle. No scene — the page's identity is the warm gradient and the small character.
 */
@Composable
private fun VietHero() {
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFFEC4899), Color(0xFFF43F5E), Color(0xFFFB923C)))),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = 56.dp, y = (-56).dp)
                .size(192.dp)
                .clip(CircleShape)
                .background(Color(0x1AFFFFFF)),
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .offset(x = (-40).dp, y = 64.dp)
                .size(160.dp)
                .clip(CircleShape)
                .background(Brush.radialGradient(listOf(Color(0x33FFFFFF), Color.Transparent))),
        )
        Column(
            modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 24.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Image(
                painter = painterResource(R.drawable.tappy_reading),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .padding(bottom = 4.dp)
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp)),
            )
            Text(text = stringResource(R.string.tool_viet_eyebrow), color = Color(0xCCFFFFFF), fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Text(
                text = stringResource(R.string.tool_viet_title1) + "\n" + stringResource(R.string.tool_viet_title2),
                color = Color.White,
                fontSize = 26.sp,
                lineHeight = 31.sp,
                fontWeight = FontWeight.Black,
            )
            Text(
                text = stringResource(R.string.tool_viet_body),
                color = Color(0xCCFFFFFF),
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/** A form-section label (`text-sm font-semibold`), optionally with the required star. */
@Composable
private fun SectionLabel(text: String, required: Boolean = false, icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) Icon(icon, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
        Text(text = text, color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        if (required) Text(text = "*", color = Color(0xFFF87171), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun TopicField(topic: String, onTopicChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionLabel(text = stringResource(R.string.vietwriter_topic_label), required = true, icon = Icons.Outlined.Edit)
        ToolTextField(
            value = topic,
            onValueChange = onTopicChange,
            placeholder = stringResource(R.string.vietwriter_topic_placeholder),
            singleLine = false,
            minLines = 3,
            maxLines = 5,
        )
        Text(
            text = stringResource(R.string.vietwriter_char_counter, topic.length),
            color = HomeV3.OnSurfaceVariant,
            fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.End,
        )
    }
}

/** Three equal tiles (`grid-cols-3`): emoji on top, name below; the pink ring when selected. */
@Composable
private fun PlatformSection(selected: VietWriterPlatform, onSelect: (VietWriterPlatform) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionLabel(text = stringResource(R.string.vietwriter_platform_label))
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            VietWriterPlatform.entries.forEach { option ->
                OptionTile(
                    selected = option == selected,
                    onClick = { onSelect(option) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(text = option.emoji, fontSize = 22.sp)
                    Text(
                        text = option.label(),
                        color = if (option == selected) HomeV3.OnSurface else HomeV3.OnSurfaceVariant,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

/** The tone pills, wrapping as on the web (`flex-wrap gap-2`). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ToneSection(selected: VietWriterTone, onSelect: (VietWriterTone) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionLabel(text = stringResource(R.string.vietwriter_tone_label))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            VietWriterTone.entries.forEach { option ->
                ToolSegment(text = option.label(), selected = option == selected, onClick = { onSelect(option) }, minHeight = 40.dp)
            }
        }
    }
}

/** Three equal tiles: the length name over its sentence-count hint. */
@Composable
private fun LengthSection(selected: VietWriterLength, onSelect: (VietWriterLength) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
        SectionLabel(text = stringResource(R.string.vietwriter_length_label))
        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            VietWriterLength.entries.forEach { option ->
                val isSelected = option == selected
                OptionTile(selected = isSelected, onClick = { onSelect(option) }, modifier = Modifier.weight(1f)) {
                    Text(
                        text = option.label(),
                        color = if (isSelected) HomeV3.OnSurface else HomeV3.OnSurfaceVariant,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = option.hint(),
                        color = HomeV3.OnSurfaceVariant,
                        fontSize = 11.5.sp,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

/** One selectable tile: 16dp radius, the surface-variant fill, the pink border + tint when selected. */
@Composable
private fun OptionTile(
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = modifier
            .heightIn(min = 64.dp)
            .clip(shape)
            .background(if (selected) Color(0x2EEC4899) else HomeV3.SurfaceVariant)
            .border(if (selected) 2.dp else 1.dp, if (selected) Color(0xFFEC4899) else HomeV3.Outline, shape)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically),
    ) {
        content()
    }
}

@Composable
private fun ResultSection(
    result: VietWriterResult,
    platformEmoji: String,
    onCopyCaption: () -> Unit,
    onCopyAll: () -> Unit,
    onRewrite: () -> Unit,
) {
    var copiedCaption by remember { mutableStateOf(false) }
    var copiedAll by remember { mutableStateOf(false) }
    LaunchedEffect(copiedCaption) { if (copiedCaption) { delay(2000); copiedCaption = false } }
    LaunchedEffect(copiedAll) { if (copiedAll) { delay(2000); copiedAll = false } }

    Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.lg)) {
        // The caption card: the platform emoji tile, the title, the small Copy chip, the text.
        ToolCard(accent = true) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(Color(0x2EEC4899)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(text = platformEmoji, fontSize = 18.sp)
                    }
                    Text(text = stringResource(R.string.vietwriter_result_title), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
                ToolButton(
                    text = if (copiedCaption) stringResource(R.string.vietwriter_copied) else stringResource(R.string.vietwriter_copy),
                    icon = if (copiedCaption) Icons.Filled.Check else Icons.Filled.ContentCopy,
                    onClick = { onCopyCaption(); copiedCaption = true },
                )
            }
            Text(text = result.caption, color = HomeV3.OnSurface, fontSize = 15.sp, lineHeight = 23.sp)
        }

        if (result.hashtags.isNotBlank()) {
            ToolCard(title = stringResource(R.string.vietwriter_hashtags_title), icon = Icons.Filled.Tag) {
                Text(text = result.hashtags, color = HomeV3.Purple, fontSize = 14.sp, lineHeight = 21.sp)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.md)) {
            ToolButton(
                text = if (copiedAll) stringResource(R.string.vietwriter_copied_all) else stringResource(R.string.vietwriter_copy_all),
                icon = Icons.Filled.ContentCopy,
                selected = true,
                onClick = { onCopyAll(); copiedAll = true },
                modifier = Modifier.weight(1f),
            )
            ToolButton(
                text = stringResource(R.string.vietwriter_rewrite),
                icon = Icons.Filled.Refresh,
                onClick = onRewrite,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("TappyAI", text))
}
