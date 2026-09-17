package com.tappyai.app.tools

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

// ── The Smart Tool feature-screen kit — the web V3 tool pages, native ────────────────────────
//
// Every redesigned web tool page (design/v3-phase4: `/scan`, `/translate`, `/currency`,
// `/split-bill`, `/scam-shield`, `/group/new`, `/music`, and `/boi` before them) is built from
// ONE family in `globals.css`: a dark HERO panel (`.v3-<tool>-hero` — hue gradient + two glows +
// a star-field + a 1px tinted border, eyebrow chip, extra-bold title whose second line is a
// gradient accent, muted body, capability chips, a decorative scene and a TappyPresence pose),
// then CARDS (`.v3-<tool>-card` — panel, 20px radius, 1px border, a 12.5px uppercase title beside
// a soft icon tile), FIELDS (64px, elevated panel, strong border), one big gradient CTA
// (`.v3-<tool>-cta`, 60px, 16px radius), shimmer loading, a quiet note and an error strip.
//
// This file is that family for Compose. Each screen keeps its OWN hue, pose, copy, chips and
// scene — the kit fixes the grammar, not the look — and every piece reads the V3 Home palette
// through [HomeV3], so the tool screens follow light/dark exactly as Home does. Nothing here
// touches a screen's ViewModel, data or navigation.

/** A tool's hero and CTA colours — the web `.v3-<tool>-hero` / `-hero-accent` / `-cta` stops. */
enum class ToolHue(
    val top: Color, val mid: Color, val bottom: Color,
    val glowA: Color, val glowB: Color,
    val border: Color,
    val accentA: Color, val accentB: Color,
    val ctaA: Color, val ctaB: Color,
) {
    /** `/scan`, `/group/new`: deep blue night, sky→blue accent. */
    Blue(
        Color(0xFF060B1F), Color(0xFF0B1A45), Color(0xFF0E1D58),
        Color(0x732563EB), Color(0x470EA5E9), Color(0x5960A5FA),
        Color(0xFF38BDF8), Color(0xFF60A5FA), Color(0xFF0EA5E9), Color(0xFF2F6BFF),
    ),
    /** `/translate`: indigo, blue→violet accent. */
    Indigo(
        Color(0xFF0B1030), Color(0xFF14124A), Color(0xFF1B1660),
        Color(0x733B82F6), Color(0x668B5CF6), Color(0x598B84FF),
        Color(0xFF60A5FA), Color(0xFFA78BFA), Color(0xFF7C3AED), Color(0xFF4F6BFF),
    ),
    /** `/currency`, `/split-bill`, `/scam-shield`: navy, violet→blue accent. */
    Navy(
        Color(0xFF0A1233), Color(0xFF0F1A4D), Color(0xFF14124A),
        Color(0x733B82F6), Color(0x596D28D9), Color(0x5960A5FA),
        Color(0xFFA78BFA), Color(0xFF60A5FA), Color(0xFF7C3AED), Color(0xFF4F6BFF),
    ),
    /** `/music`: the saturated blue→indigo→violet stage. */
    Music(
        Color(0xFF1D4ED8), Color(0xFF4338CA), Color(0xFF6D28D9),
        Color(0x73A78BFA), Color(0x8C060C28), Color(0x24FFFFFF),
        Color(0xFFBFDBFE), Color(0xFFBFDBFE), Color(0xFF7C3AED), Color(0xFF4F6BFF),
    ),
    /** `/viet-content`: pink-500 → rose-500 → orange-400, white/10 discs. */
    Pink(
        Color(0xFFEC4899), Color(0xFFF43F5E), Color(0xFFFB923C),
        Color(0x1AFFFFFF), Color(0x1AFFFFFF), Color(0x33FFFFFF),
        Color(0xFFFFE4E6), Color(0xFFFFEDD5), Color(0xFFEC4899), Color(0xFFF97316),
    ),
}

/**
 * The page frame: the V3 palette, the page ground, a scrolling column at the content width with
 * the tool's own back row. Keyboard-aware, so the CTA under a field is never hidden by the IME.
 */
@Composable
fun ToolV3Page(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    V3HomeTheme {
        Column(
            modifier = modifier
                .fillMaxSize()
                .background(HomeV3.Background)
                .verticalScroll(rememberScrollState())
                .imePadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = TappyContainers.content)
                    .fillMaxWidth()
                    .padding(TappySpacing.xl),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.xl),
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.common_back),
                        tint = HomeV3.OnSurface,
                    )
                }
                content()
            }
        }
    }
}

/** One capability chip in the hero (`.v3-<tool>-chip` / `-cap`): a glyph and a short claim. */
data class ToolChip(val icon: ImageVector, val text: String)

/**
 * The hero panel. [title1] is the plain first line, [title2] the gradient-accent second line
 * (the web's `<span class="…-hero-accent">`); [scene] draws the tool's decoration behind the
 * mascot (documents, bubbles, coins, a globe…), [mascotRes] is the pose the web page uses.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ToolHero(
    hue: ToolHue,
    eyebrow: String,
    title1: String,
    title2: String?,
    body: String,
    @DrawableRes mascotRes: Int,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    chips: List<ToolChip> = emptyList(),
    mascotSize: Dp = 176.dp,
    sceneHeight: Dp = 168.dp,
    scene: (@Composable BoxScope.() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(28.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(elevation = 16.dp, shape = shape, ambientColor = hue.glowA, spotColor = hue.glowA)
            .clip(shape)
            .background(Brush.linearGradient(listOf(hue.top, hue.mid, hue.bottom)))
            .drawBehind {
                drawCircle(
                    Brush.radialGradient(listOf(hue.glowA, Color.Transparent), center = Offset(size.width * 0.78f, size.height * 0.25f), radius = size.width * 0.6f),
                    radius = size.width * 0.6f, center = Offset(size.width * 0.78f, size.height * 0.25f),
                )
                drawCircle(
                    Brush.radialGradient(listOf(hue.glowB, Color.Transparent), center = Offset(size.width * 0.15f, size.height), radius = size.width * 0.5f),
                    radius = size.width * 0.5f, center = Offset(size.width * 0.15f, size.height),
                )
                for ((x, y, r, a) in HERO_STARS) {
                    drawCircle(Color.White.copy(alpha = a), radius = r.dp.toPx(), center = Offset(size.width * x, size.height * y))
                }
            }
            .border(1.dp, hue.border, shape)
            .padding(horizontal = 20.dp, vertical = 22.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
            modifier = Modifier
                .clip(CircleShape)
                .background(Color(0x14FFFFFF))
                .border(1.dp, Color(0x2EFFFFFF), CircleShape)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        ) {
            Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
            Text(text = eyebrow, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(14.dp))
        Text(
            text = title1,
            color = Color.White,
            fontSize = 28.sp,
            lineHeight = 31.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = (-0.5).sp,
        )
        if (title2 != null) {
            Text(
                text = title2,
                style = androidx.compose.ui.text.TextStyle(
                    brush = Brush.linearGradient(listOf(hue.accentA, hue.accentB)),
                    fontSize = 28.sp,
                    lineHeight = 31.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-0.5).sp,
                ),
            )
        }
        Spacer(Modifier.height(12.dp))
        Text(text = body, color = HeroMuted, fontSize = 14.5.sp, lineHeight = 21.sp)
        if (subtitle != null) {
            Text(text = subtitle, color = HeroDim, fontSize = 13.5.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
        }
        if (chips.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md),
                verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
                modifier = Modifier.padding(top = 14.dp),
            ) {
                chips.forEach { chip ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0x73080C28))
                            .border(1.dp, Color(0x1FFFFFFF), RoundedCornerShape(12.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        Icon(chip.icon, contentDescription = null, tint = hue.accentA, modifier = Modifier.size(14.dp))
                        Text(text = chip.text, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        // The scene: the tool's decoration behind the mascot, which stands bottom-centre as on
        // the web's phone layout.
        Box(modifier = Modifier.fillMaxWidth().height(sceneHeight).padding(top = 8.dp)) {
            scene?.invoke(this)
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .size(mascotSize)
                    .drawBehind { drawCircle(Color.White.copy(alpha = 0.10f), radius = size.minDimension * 0.52f) },
            ) {
                Image(
                    painter = painterResource(mascotRes),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

/** A floating speech bubble in a hero scene (`.v3-tr-bubble`, `.v3-scan-bubble`, `.v3-sb-bubble`). */
@Composable
fun BoxScope.ToolBubble(text: String, a: Color, b: Color, alignment: Alignment, modifier: Modifier = Modifier) {
    Text(
        text = text,
        color = Color.White,
        fontSize = 14.sp,
        fontWeight = FontWeight.Bold,
        modifier = modifier
            .align(alignment)
            .shadow(8.dp, RoundedCornerShape(14.dp), ambientColor = Color.Black.copy(alpha = 0.4f), spotColor = Color.Black.copy(alpha = 0.4f))
            .clip(RoundedCornerShape(14.dp))
            .background(Brush.linearGradient(listOf(a, b)))
            .border(1.dp, Color(0x38FFFFFF), RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

/** A thin orbit ring in a hero scene (`.v3-tr-orbit`, `.v3-fx-orbit`). */
@Composable
fun BoxScope.ToolOrbit(size: Dp, alignment: Alignment, color: Color = Color(0x47C4B5FD), modifier: Modifier = Modifier) {
    Box(modifier = modifier.align(alignment).size(size).border(1.dp, color, CircleShape))
}

/** A soft glowing disc in a hero scene (`.v3-tr-globe`, `.v3-fx-globe`). */
@Composable
fun BoxScope.ToolGlobe(size: Dp, alignment: Alignment, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .align(alignment)
            .size(size)
            .background(Brush.radialGradient(listOf(color, Color.Transparent))),
    )
}

/** A coin token in a hero scene (`.v3-fx-coin`, `.v3-sb-coin`). */
@Composable
fun BoxScope.ToolCoin(symbol: String, a: Color, b: Color, alignment: Alignment, size: Dp = 40.dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .align(alignment)
            .size(size)
            .shadow(8.dp, CircleShape, ambientColor = a.copy(alpha = 0.6f), spotColor = a.copy(alpha = 0.6f))
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(a, b)))
            .border(1.dp, Color(0x47FFFFFF), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = symbol, color = Color.White, fontSize = (size.value * 0.42f).sp, fontWeight = FontWeight.ExtraBold)
    }
}

/**
 * A titled card (`.v3-<tool>-card`): the panel, a soft icon tile and the 12.5sp uppercase title;
 * [accent] paints the title in the accent (the web's result cards).
 */
@Composable
fun ToolCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    icon: ImageVector? = null,
    accent: Boolean = false,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(HomeV3.Surface)
            .border(1.dp, if (accent) HomeV3.Purple.copy(alpha = 0.45f) else HomeV3.Outline, shape)
            .padding(TappySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        if (title != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (icon != null) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(HomeV3.Purple.copy(alpha = 0.16f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(icon, contentDescription = null, tint = HomeV3.Purple, modifier = Modifier.size(18.dp))
                    }
                }
                Text(
                    text = title.uppercase(),
                    color = if (accent) HomeV3.Purple else HomeV3.OnSurfaceVariant,
                    fontSize = 12.5.sp,
                    letterSpacing = 1.2.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                trailing?.invoke()
            }
        }
        content()
    }
}

/** A field container (`.v3-<tool>-field`): 64dp min, elevated panel, strong border, 16dp radius. */
@Composable
fun ToolField(modifier: Modifier = Modifier, minHeight: Dp = 64.dp, content: @Composable RowScopeContent) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = minHeight)
            .clip(shape)
            .background(HomeV3.SurfaceVariant)
            .border(1.dp, HomeV3.Outline, shape)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}
typealias RowScopeContent = androidx.compose.foundation.layout.RowScope.() -> Unit

/**
 * The text field in the tool skin (`.v3-<tool>-textarea` / `-input`): elevated panel, strong
 * border, accent focus ring, 15sp copy. A plain OutlinedTextField underneath — same input
 * behaviour, IME and selection as everywhere else.
 */
@Composable
fun ToolTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    keyboardType: KeyboardType = KeyboardType.Text,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    textSize: androidx.compose.ui.unit.TextUnit = 15.sp,
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        modifier = modifier.fillMaxWidth(),
        placeholder = placeholder?.let { { Text(it, fontSize = textSize, color = HomeV3.OnSurfaceVariant) } },
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        leadingIcon = leadingIcon,
        trailingIcon = trailingIcon,
        textStyle = androidx.compose.ui.text.TextStyle(fontSize = textSize, color = HomeV3.OnSurface, lineHeight = (textSize.value * 1.45f).sp),
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = HomeV3.SurfaceVariant,
            unfocusedContainerColor = HomeV3.SurfaceVariant,
            focusedBorderColor = HomeV3.Purple,
            unfocusedBorderColor = HomeV3.Outline,
            focusedTextColor = HomeV3.OnSurface,
            unfocusedTextColor = HomeV3.OnSurface,
            cursorColor = HomeV3.Purple,
            focusedLeadingIconColor = HomeV3.OnSurfaceVariant,
            unfocusedLeadingIconColor = HomeV3.OnSurfaceVariant,
            focusedTrailingIconColor = HomeV3.OnSurfaceVariant,
            unfocusedTrailingIconColor = HomeV3.OnSurfaceVariant,
            disabledContainerColor = HomeV3.SurfaceVariant,
            disabledBorderColor = HomeV3.Outline,
            disabledTextColor = HomeV3.OnSurfaceVariant,
        ),
    )
}

/** The one big action (`.v3-<tool>-cta`): 60dp, 16dp radius, the tool's gradient, 17sp bold. */
@Composable
fun ToolCta(
    text: String,
    hue: ToolHue,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(60.dp)
            .alpha(if (enabled) 1f else 0.55f)
            .shadow(if (enabled) 14.dp else 0.dp, shape, ambientColor = hue.ctaA.copy(alpha = 0.5f), spotColor = hue.ctaA.copy(alpha = 0.5f))
            .clip(shape)
            .background(Brush.linearGradient(listOf(hue.ctaA, hue.ctaB)))
            .clickable(enabled = enabled && !loading, onClickLabel = text, onClick = onClick)
            .padding(horizontal = 24.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
            Spacer(Modifier.size(12.dp))
        } else if (icon != null) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            Spacer(Modifier.size(12.dp))
        }
        Text(text = text, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
    }
}

/** A secondary pill button (`.v3-<tool>-btn`): 44dp, elevated panel. */
@Composable
fun ToolButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, selected: Boolean = false) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(if (selected) HomeV3.Purple else HomeV3.SurfaceVariant)
            .border(1.dp, if (selected) HomeV3.Purple else HomeV3.Outline, shape)
            .clickable(onClickLabel = text, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = if (selected) Color.White else HomeV3.OnSurface, modifier = Modifier.size(18.dp))
        Text(text = text, color = if (selected) Color.White else HomeV3.OnSurface, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** A segment in a segmented choice (`.v3-sb-seg`): 48dp, selected = accent fill. */
@Composable
fun ToolSegment(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, minHeight: Dp = 48.dp) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier = modifier
            .heightIn(min = minHeight)
            .clip(shape)
            .background(if (selected) HomeV3.Purple else HomeV3.SurfaceVariant)
            .border(1.dp, if (selected) HomeV3.Purple else HomeV3.Outline, shape)
            .clickable(onClickLabel = text, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, color = if (selected) Color.White else HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
    }
}

/** The shimmer result placeholder (`.v3-<tool>-shimmer`). */
@Composable
fun ToolShimmer(widths: List<Float> = listOf(0.33f, 1f, 0.92f, 0.75f)) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        widths.forEach { w ->
            Box(
                modifier = Modifier
                    .fillMaxWidth(w)
                    .height(14.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .background(HomeV3.OnSurfaceVariant.copy(alpha = 0.18f)),
            )
        }
    }
}

/** A quiet centred note under the CTA (`.v3-<tool>-note`). */
@Composable
fun ToolNote(text: String, icon: ImageVector? = null) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = TappySpacing.xl),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(16.dp))
            Spacer(Modifier.size(8.dp))
        }
        Text(text = text, color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, lineHeight = 18.sp, textAlign = TextAlign.Center)
    }
}

/** The error strip (`.v3-<tool>-error`). */
@Composable
fun ToolError(message: String) {
    val shape = RoundedCornerShape(16.dp)
    Text(
        text = message,
        color = Color(0xFFFCA5A5),
        fontSize = 14.sp,
        lineHeight = 19.sp,
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color(0x33EF4444))
            .border(1.dp, Color(0x66EF4444), shape)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

private val HeroMuted = Color(0xDBE2E8FF)
private val HeroDim = Color(0xA3E2E8FF)

/** (x, y) as fractions of the panel, radius in dp, alpha — the web's eight `radial-gradient` dots. */
private data class Star(val x: Float, val y: Float, val r: Float, val a: Float)
private val HERO_STARS = listOf(
    Star(0.12f, 0.22f, 0.9f, 0.9f), Star(0.28f, 0.68f, 0.9f, 0.7f), Star(0.44f, 0.18f, 1.2f, 0.85f),
    Star(0.61f, 0.74f, 0.9f, 0.6f), Star(0.73f, 0.30f, 1.2f, 0.9f), Star(0.86f, 0.58f, 0.9f, 0.7f),
    Star(0.93f, 0.14f, 0.9f, 0.8f), Star(0.52f, 0.88f, 0.9f, 0.6f),
)
