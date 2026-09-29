package com.tappyai.app.vietwriter

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.FormatListBulleted
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Eco
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SentimentSatisfied
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Work
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.tools.ToolButton
import com.tappyai.app.tools.ToolError
import com.tappyai.app.tools.ToolTextField
import com.tappyai.app.tools.ToolV3Page
import com.tappyai.app.vietwriter.data.VietWriterResult
import kotlinx.coroutines.delay

/**
 * VietWriter — the web `/viet-content` (`VietContentView` + `VietContentForm`, approved "Viết
 * content" design 2026-09-28 — D:/redesign Sep 28 02_12, ANDROID-REQUESTS R2): the blue→indigo→
 * violet hero with the reading otter and the three platform marks, then one card per section —
 * topic (with "Thử gợi ý", which cycles the web's five example topics locally, and the 0/500
 * counter), platform tiles with the REAL brand marks, tone pills with their icons, length tiles
 * (name + the sentence-count hint the API actually uses) — the gradient "Tạo caption ngay", the
 * error panel, and the result: caption card with the platform mark and "Platform · Tone", the
 * hashtag card, then Copy-all / Rewrite.
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
    var exampleIdx by rememberSaveable { mutableIntStateOf(0) }
    val examples = VIET_EXAMPLE_TOPICS.map { stringResource(it) }

    ToolV3Page(onBack = onBack) {
        VietHero()

        SectionCard(
            key = "topic", icon = Icons.Outlined.Edit, title = stringResource(R.string.vietwriter_topic_label), required = true,
            action = {
                TryExampleButton(onClick = {
                    // The same change callback as typing (it keeps the 500 bound).
                    viewModel.onTopicChange(examples[exampleIdx % examples.size])
                    exampleIdx = (exampleIdx + 1) % examples.size
                })
            },
        ) {
            ToolTextField(
                value = viewModel.topic,
                onValueChange = viewModel::onTopicChange,
                placeholder = stringResource(R.string.vietwriter_topic_placeholder),
                singleLine = false,
                minLines = 3,
                maxLines = 5,
                textSize = 14.sp,
            )
            Text(
                text = stringResource(R.string.vietwriter_char_counter, viewModel.topic.length),
                color = HomeV3.OnSurfaceVariant,
                fontSize = 12.sp,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.End,
            )
        }

        SectionCard(key = "platform", icon = Icons.Filled.Layers, title = stringResource(R.string.vietwriter_platform_label), hint = stringResource(R.string.vietwriter_platform_hint)) {
            PlatformTiles(current = viewModel.platform, onSelect = viewModel::onPlatformChange)
        }
        SectionCard(key = "tone", icon = Icons.Filled.AutoFixHigh, title = stringResource(R.string.vietwriter_tone_label), hint = stringResource(R.string.vietwriter_tone_hint)) {
            TonePills(current = viewModel.tone, onSelect = viewModel::onToneChange)
        }
        SectionCard(key = "length", icon = Icons.Outlined.Description, title = stringResource(R.string.vietwriter_length_label), hint = stringResource(R.string.vietwriter_length_hint)) {
            LengthTiles(current = viewModel.length, onSelect = viewModel::onLengthChange)
        }

        GenerateButton(
            generating = viewModel.isGenerating,
            enabled = viewModel.topic.isNotBlank() && !viewModel.isGenerating,
            onClick = viewModel::generate,
        )

        viewModel.errorMessage?.let { ToolError(it) }

        viewModel.result?.let { result ->
            ResultSection(
                result = result,
                platform = viewModel.platform,
                tone = viewModel.tone,
                onCopyCaption = { copyToClipboard(context, result.caption) },
                onCopyAll = { copyToClipboard(context, "${result.caption}\n\n${result.hashtags}") },
                onRewrite = viewModel::onReset,
            )
        }
    }
}

/** The web's palette for this page: `primary` #007AFF, `accent` #FF9500, Tailwind indigo/violet/pink. */
private object Vc {
    val Primary = Color(0xFF007AFF)
    val PrimaryLight = Color(0xFF66ACFF)
    val Accent = Color(0xFFFF9500)
    val AccentLight = Color(0xFFFFBD66)
    val HeroBrush = Brush.linearGradient(listOf(Color(0xFF001833), Color(0xFF3730A3), Color(0xFF7C3AED)))
    val CtaBrush = Brush.horizontalGradient(listOf(Color(0xFF007AFF), Color(0xFF6366F1), Color(0xFF8B5CF6)))
    val AccentWords = Brush.horizontalGradient(listOf(Color(0xFFFFBD66), Color(0xFFF472B6), Color(0xFFA78BFA)))
}

/**
 * The hero, as on the web: a 24dp-radius primary-900 → indigo-800 → violet-600 sweep with two soft
 * glows, the kicker with a sparkle, the two-line black title with only the accent words in the
 * orange → pink → violet gradient, the subtitle, and the reading otter with the Facebook, TikTok and
 * Instagram marks around it.
 */
@Composable
private fun VietHero() {
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Vc.HeroBrush)
            .border(1.dp, Color.White.copy(alpha = 0.10f), shape)
            .testTag("vc_hero"),
    ) {
        Box(
            modifier = Modifier.align(Alignment.BottomEnd).offset(x = 40.dp, y = 64.dp).size(224.dp)
                .background(Brush.radialGradient(listOf(Vc.AccentLight.copy(alpha = 0.30f), Color.Transparent)), CircleShape),
        )
        Box(
            modifier = Modifier.align(Alignment.TopStart).offset(x = (-40).dp, y = (-64).dp).size(160.dp)
                .background(Brush.radialGradient(listOf(Color(0x333391FF), Color.Transparent)), CircleShape),
        )
        Row(modifier = Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Vc.PrimaryLight, modifier = Modifier.size(16.dp))
                    Text(text = stringResource(R.string.tool_viet_eyebrow), color = Color(0xFF99C8FF), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
                Text(
                    text = buildAnnotatedString {
                        append(stringResource(R.string.tool_viet_title1))
                        append("\n")
                        append(stringResource(R.string.tool_viet_title2_lead))
                        append(" ")
                        withStyle(SpanStyle(brush = Vc.AccentWords)) { append(stringResource(R.string.tool_viet_title_accent)) }
                        withStyle(SpanStyle(color = Vc.AccentLight)) { append(" ✦") }
                    },
                    color = Color.White,
                    fontSize = 24.sp,
                    lineHeight = 30.sp,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Text(
                    text = stringResource(R.string.tool_viet_body),
                    color = Color.White.copy(alpha = 0.80f),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            Box(modifier = Modifier.size(112.dp)) {
                Image(
                    painter = painterResource(R.drawable.tappy_reading),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
                BrandMark(VietWriterPlatform.Facebook, Modifier.align(Alignment.TopEnd).size(28.dp).rotate(6f))
                BrandMark(VietWriterPlatform.TikTok, Modifier.align(Alignment.BottomEnd).offset(x = 4.dp, y = (-24).dp).size(28.dp).rotate(-6f))
                BrandMark(VietWriterPlatform.Instagram, Modifier.align(Alignment.TopStart).offset(x = (-8).dp, y = 32.dp).size(28.dp).rotate(-12f))
            }
        }
    }
}

/**
 * The real brand marks: Facebook and TikTok are the bundled share-sheet logos; Instagram has no
 * bundled file (neither on the web), so it is drawn like the web's inline SVG — the gradient
 * rounded square with the camera glyph.
 */
@Composable
private fun BrandMark(platform: VietWriterPlatform, modifier: Modifier = Modifier) {
    when (platform) {
        VietWriterPlatform.Facebook -> Image(painterResource(R.drawable.share_brand_facebook), contentDescription = null, modifier = modifier.clip(RoundedCornerShape(12.dp)))
        VietWriterPlatform.TikTok -> Image(painterResource(R.drawable.share_brand_tiktok), contentDescription = null, modifier = modifier.clip(RoundedCornerShape(12.dp)))
        VietWriterPlatform.Instagram -> InstagramMark(modifier)
    }
}

@Composable
private fun InstagramMark(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val u = size.minDimension / 48f
        drawRoundRect(
            brush = Brush.radialGradient(
                0f to Color(0xFFFEDA75), 0.3f to Color(0xFFFA7E1E), 0.55f to Color(0xFFD62976), 0.8f to Color(0xFF962FBF), 1f to Color(0xFF4F5BD5),
                center = Offset(0.3f * size.width, 1.05f * size.height),
                radius = 1.2f * size.width,
            ),
            cornerRadius = CornerRadius(12 * u),
        )
        val stroke = Stroke(width = 3.2f * u)
        drawRoundRect(color = Color.White, topLeft = Offset(11 * u, 11 * u), size = Size(26 * u, 26 * u), cornerRadius = CornerRadius(8 * u), style = stroke)
        drawCircle(color = Color.White, radius = 6.3f * u, center = Offset(24 * u, 24 * u), style = stroke)
        drawCircle(color = Color.White, radius = 2f * u, center = Offset(31.6f * u, 16.4f * u))
    }
}

/** `SectionCard`: the icon + title (+ required star) with a right-aligned hint or action, then the body. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SectionCard(
    key: String,
    icon: ImageVector,
    title: String,
    hint: String? = null,
    required: Boolean = false,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, shape)
            .testTag("vc_section_$key")
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(end = 12.dp)) {
                Icon(icon, contentDescription = null, tint = Vc.Primary, modifier = Modifier.size(20.dp))
                Text(text = title, color = HomeV3.OnSurface, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                if (required) Text(text = "*", color = Color(0xFFF87171), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
            if (hint != null) Text(text = hint, color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterVertically))
            action?.invoke()
        }
        content()
    }
}

@Composable
private fun TryExampleButton(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.05f))
            .clickable(role = Role.Button, onClick = onClick)
            .testTag("vc_try_example")
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(Icons.Filled.Lightbulb, contentDescription = null, tint = Vc.AccentLight, modifier = Modifier.size(16.dp))
        Text(text = stringResource(R.string.vietwriter_try_example), color = Vc.AccentLight, fontSize = 14.sp, fontWeight = FontWeight.Medium)
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Vc.AccentLight, modifier = Modifier.size(15.dp))
    }
}

/** The small filled check in a selected tile's corner (web `SelectedCheck`). */
@Composable
private fun SelectedCheck(modifier: Modifier = Modifier) {
    Box(modifier = modifier.size(20.dp).clip(CircleShape).background(Vc.Primary), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp))
    }
}

private fun tileModifier(selected: Boolean, shape: RoundedCornerShape, outline: Color): Modifier = Modifier
    .clip(shape)
    .background(if (selected) Vc.Primary.copy(alpha = 0.16f) else Color.Transparent)
    .border(2.dp, if (selected) Vc.Primary else outline, shape)

/** Three equal tiles (`grid-cols-3`): the brand mark over the name; primary ring + check when chosen. */
@Composable
private fun PlatformTiles(current: VietWriterPlatform, onSelect: (VietWriterPlatform) -> Unit) {
    val outline = HomeV3.Outline
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        VietWriterPlatform.entries.forEach { option ->
            val on = option == current
            val shape = RoundedCornerShape(16.dp)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .then(tileModifier(on, shape, outline))
                    .clickable(role = Role.RadioButton, onClick = { onSelect(option) })
                    .semantics { selected = on }
                    .testTag("vc_platform_${option.wireValue}"),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    BrandMark(option, Modifier.size(40.dp))
                    Text(text = option.label(), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
                if (on) SelectedCheck(Modifier.align(Alignment.TopEnd).padding(8.dp))
            }
        }
    }
}

/** Each tone's icon and colour (web `TONES`: Smile amber, Heart rose, Zap accent, Leaf emerald, Briefcase violet). */
private fun VietWriterTone.icon(): Pair<ImageVector, Color> = when (this) {
    VietWriterTone.Funny -> Icons.Filled.SentimentSatisfied to Color(0xFFFBBF24)
    VietWriterTone.Emotional -> Icons.Filled.Favorite to Color(0xFFF43F5E)
    VietWriterTone.Youthful -> Icons.Filled.Bolt to Vc.Accent
    VietWriterTone.Inspiring -> Icons.Filled.Eco to Color(0xFF10B981)
    VietWriterTone.Professional -> Icons.Filled.Work to Color(0xFFA78BFA)
}

/** The tone pills, wrapping as on the web (`flex-wrap gap-2`), accent ring when chosen. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TonePills(current: VietWriterTone, onSelect: (VietWriterTone) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        VietWriterTone.entries.forEach { option ->
            val on = option == current
            val (icon, tint) = option.icon()
            Row(
                modifier = Modifier
                    .heightIn(min = 40.dp)
                    .clip(CircleShape)
                    .background(if (on) Vc.Accent.copy(alpha = 0.14f) else Color.Transparent)
                    .border(2.dp, if (on) Vc.Accent else HomeV3.Outline, CircleShape)
                    .clickable(role = Role.RadioButton, onClick = { onSelect(option) })
                    .semantics { selected = on }
                    .testTag("vc_tone_${option.wireValue}")
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
                Text(text = option.label(), color = if (on) Vc.AccentLight else HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

/** The length tiles: a list glyph, the name, the sentence-count hint; stacked at phone width (web `grid-cols-1` < 420px). */
@Composable
private fun LengthTiles(current: VietWriterLength, onSelect: (VietWriterLength) -> Unit) {
    val outline = HomeV3.Outline
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        VietWriterLength.entries.forEach { option ->
            val on = option == current
            val shape = RoundedCornerShape(16.dp)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .then(tileModifier(on, shape, outline))
                    .clickable(role = Role.RadioButton, onClick = { onSelect(option) })
                    .semantics { selected = on }
                    .testTag("vc_length_${option.wireValue}"),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.05f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Filled.FormatListBulleted, contentDescription = null, tint = Vc.PrimaryLight, modifier = Modifier.size(18.dp))
                    }
                    Column {
                        Text(text = option.label(), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text(text = option.hint(), color = if (on) Vc.PrimaryLight else HomeV3.OnSurfaceVariant, fontSize = 12.sp)
                    }
                }
                if (on) SelectedCheck(Modifier.align(Alignment.TopEnd).padding(8.dp))
            }
        }
    }
}

/** The submit: primary → indigo → violet, sparkle + label + arrow; "Đang viết content…" with a spinner. */
@Composable
private fun GenerateButton(generating: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .alpha(if (enabled || generating) 1f else 0.5f)
            .clip(shape)
            .background(Vc.CtaBrush)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .testTag("vc_submit"),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (generating) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
            Text(text = stringResource(R.string.vietwriter_generating), color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        } else {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
            Text(text = stringResource(R.string.vietwriter_generate), color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun ResultSection(
    result: VietWriterResult,
    platform: VietWriterPlatform,
    tone: VietWriterTone,
    onCopyCaption: () -> Unit,
    onCopyAll: () -> Unit,
    onRewrite: () -> Unit,
) {
    var copiedCaption by remember { mutableStateOf(false) }
    var copiedAll by remember { mutableStateOf(false) }
    LaunchedEffect(copiedCaption) { if (copiedCaption) { delay(2000); copiedCaption = false } }
    LaunchedEffect(copiedAll) { if (copiedAll) { delay(2000); copiedAll = false } }
    val shape = RoundedCornerShape(20.dp)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.testTag("vc_result")) {
        // The caption card: the platform mark, the title over "Platform · Tone", the small Copy chip, the text.
        Column(
            modifier = Modifier.fillMaxWidth().clip(shape).background(HomeV3.Surface).border(1.dp, HomeV3.Outline, shape).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                BrandMark(platform, Modifier.size(28.dp))
                Column(modifier = Modifier.weight(1f).padding(start = 8.dp)) {
                    Text(text = stringResource(R.string.vietwriter_result_title), color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text(text = "${platform.label()} · ${tone.label()}", color = HomeV3.OnSurfaceVariant, fontSize = 12.sp)
                }
                ToolButton(
                    text = if (copiedCaption) stringResource(R.string.vietwriter_copied) else stringResource(R.string.vietwriter_copy),
                    icon = if (copiedCaption) Icons.Filled.Check else Icons.Filled.ContentCopy,
                    onClick = { onCopyCaption(); copiedCaption = true },
                )
            }
            Text(text = result.caption, color = HomeV3.OnSurface, fontSize = 14.sp, lineHeight = 22.sp)
        }

        if (result.hashtags.isNotBlank()) {
            Column(
                modifier = Modifier.fillMaxWidth().clip(shape).background(HomeV3.Surface).border(1.dp, HomeV3.Outline, shape).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.Tag, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(13.dp))
                    Text(text = stringResource(R.string.vietwriter_hashtags_title).uppercase(), color = HomeV3.OnSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp)
                }
                Text(text = result.hashtags, color = Vc.PrimaryLight, fontSize = 14.sp, lineHeight = 21.sp)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlineAction(
                text = if (copiedAll) stringResource(R.string.vietwriter_copied_all) else stringResource(R.string.vietwriter_copy_all),
                icon = if (copiedAll) Icons.Filled.Check else Icons.Filled.ContentCopy,
                color = Vc.PrimaryLight,
                border = Vc.Primary,
                onClick = { onCopyAll(); copiedAll = true },
                modifier = Modifier.weight(1f),
            )
            OutlineAction(
                text = stringResource(R.string.vietwriter_rewrite),
                icon = Icons.Filled.Refresh,
                color = HomeV3.OnSurfaceVariant,
                border = HomeV3.Outline,
                onClick = onRewrite,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun OutlineAction(text: String, icon: ImageVector, color: Color, border: Color, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(shape)
            .border(2.dp, border, shape)
            .clickable(role = Role.Button, onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(15.dp))
        Text(text = text, color = color, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("TappyAI", text))
}
