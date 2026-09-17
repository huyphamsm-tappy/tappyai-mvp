package com.tappyai.app.personal

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tappyai.app.R
import com.tappyai.app.home.HomeV3
import com.tappyai.app.home.V3HomeTheme
import com.tappyai.core.designsystem.component.TappyImage
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * The V3 personal surfaces' shared vocabulary — the Compose counterpart of the web's `V3Shell`
 * page chrome and `.v3-panel` family (design/v3-phase4 `src/components/v3/`, `globals.css`).
 * Used by AI Planner, Following / Followers, History and the Profile hub; every piece maps to a
 * CSS rule the web already has, so the four screens read as one product while each keeps its
 * own composition.
 */

/** `.v3-panel`: the panel surface — 16dp radius, the surface fill, the hairline border. */
internal val V3PanelShape = RoundedCornerShape(16.dp)

/** `--v3-accent-soft` / `--v3-accent`: the soft accent tile behind a glyph. */
@Composable
internal fun v3AccentSoft(): Color = HomeV3.Purple.copy(alpha = 0.16f)

/** The V3 semantic tones the web's tokens carry (`--v3-violet`, `--v3-emerald`, `--v3-amber`, `--v3-rose`). */
internal object V3Tone {
    val Violet = Color(0xFF8B5CF6)
    val Emerald = Color(0xFF10B981)
    val Amber = Color(0xFFF59E0B)
    val Rose = Color(0xFFF43F5E)
}

/**
 * The page: `V3Shell` at phone width — the V3 ground, a scrolling column at the content width,
 * a back row with the page title and its one-line subtitle (`V3Shell`'s `title`/`subtitle`).
 */
@Composable
internal fun V3PersonalPage(
    title: String,
    subtitle: String?,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: (@Composable RowScope.() -> Unit)? = null,
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
                V3PageHeader(title = title, subtitle = subtitle, onBack = onBack, trailing = trailing)
                content()
            }
        }
    }
}

/** The back row + title block that every personal page opens with. */
@Composable
internal fun V3PageHeader(
    title: String,
    subtitle: String?,
    onBack: () -> Unit,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back), tint = HomeV3.OnSurface)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, color = HomeV3.OnSurface, fontSize = 20.sp, lineHeight = 24.sp, fontWeight = FontWeight.ExtraBold)
            if (!subtitle.isNullOrBlank()) {
                Text(text = subtitle, color = HomeV3.OnSurfaceVariant, fontSize = 12.5.sp, lineHeight = 17.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        trailing?.invoke(this)
    }
}

/** `.v3-panel`: a bordered surface panel. [padding] is the web's `p-4`/`p-5`. */
@Composable
internal fun V3Panel(
    modifier: Modifier = Modifier,
    padding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(V3PanelShape)
            .background(HomeV3.Surface)
            .border(1.dp, HomeV3.Outline, V3PanelShape)
            .padding(padding),
        content = content,
    )
}

/**
 * `.v3-panel-header` + `.v3-panel-title`: the panel's own title row — a 14sp bold title, an
 * optional coloured 26dp glyph tile before it, an optional `.v3-seeall` action after it.
 */
@Composable
internal fun V3PanelHeader(
    title: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    tint: Color = HomeV3.Purple,
    action: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) {
            Box(
                modifier = Modifier.size(26.dp).clip(RoundedCornerShape(8.dp)).background(tint.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(13.dp))
            }
        }
        Text(text = title, color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        if (action != null && onAction != null) {
            Text(
                text = action,
                color = HomeV3.Purple,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(CircleShape).clickable(onClick = onAction).padding(horizontal = 6.dp, vertical = 4.dp),
            )
        }
    }
}

/** `.v3-chip`: one pill of a `ChipRow`; the bright accent fill when selected. */
@Composable
internal fun V3Chip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .heightIn(min = 36.dp)
            .clip(CircleShape)
            .background(if (selected) HomeV3.Purple else HomeV3.SurfaceVariant)
            .border(1.dp, if (selected) HomeV3.Purple else HomeV3.Outline, CircleShape)
            .clickable(onClickLabel = text, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, color = if (selected) Color.White else HomeV3.OnSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** The web's underline tab strip (`role="tablist"` with a 2px accent border on the active tab). */
@Composable
internal fun V3UnderlineTabs(labels: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    Column {
        Row(modifier = Modifier.fillMaxWidth()) {
            labels.forEachIndexed { i, label ->
                val active = i == selected
                Column(
                    modifier = Modifier
                        .clickable(onClickLabel = label) { onSelect(i) }
                        .padding(horizontal = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = label,
                        color = if (active) HomeV3.Purple else HomeV3.OnSurfaceVariant,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
                    )
                    Box(
                        modifier = Modifier
                            .width(if (active) 40.dp else 0.dp)
                            .height(2.dp)
                            .background(HomeV3.Purple),
                    )
                }
            }
        }
        HorizontalDivider(color = HomeV3.Outline, thickness = 1.dp)
    }
}

/** `--v3-accent-fill` pill button (`min-h-[36px] rounded-full px-3.5 text-[12.5px] font-semibold`). */
@Composable
internal fun V3AccentPill(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, minHeight: Dp = 36.dp) {
    Row(
        modifier = modifier
            .heightIn(min = minHeight)
            .clip(CircleShape)
            .background(HomeV3.Purple)
            .clickable(onClickLabel = text, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
        Text(text = text, color = Color.White, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** The quiet bordered pill (`bg-panel border-border text-fg-secondary`) — Edit profile, Following. */
@Composable
internal fun V3OutlinePill(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null, enabled: Boolean = true, minHeight: Dp = 36.dp) {
    Row(
        modifier = modifier
            .heightIn(min = minHeight)
            .clip(CircleShape)
            .background(HomeV3.SurfaceVariant)
            .border(1.dp, HomeV3.Outline, CircleShape)
            .clickable(enabled = enabled, onClickLabel = text, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(13.dp))
        Text(text = text, color = HomeV3.OnSurface, fontSize = 12.5.sp, fontWeight = FontWeight.Medium)
    }
}

/**
 * The web `UserAvatar`: the picture, or the name's initial on the soft accent disc. Never a
 * generated face, never a placeholder photo.
 */
@Composable
internal fun V3Avatar(url: String?, name: String, size: Dp, modifier: Modifier = Modifier, ring: Boolean = false) {
    val initial = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(v3AccentSoft())
            .then(if (ring) Modifier.border(2.dp, HomeV3.Purple.copy(alpha = 0.4f), CircleShape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (!url.isNullOrBlank()) {
            TappyImage(url = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(CircleShape))
        } else {
            Text(text = initial, color = HomeV3.Purple, fontSize = (size.value * 0.36f).sp, fontWeight = FontWeight.Bold)
        }
    }
}

/** The dashed-border empty panel (`border-dashed px-6 py-9 text-center`). */
@Composable
internal fun V3EmptyPanel(
    text: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    title: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    val outline = HomeV3.Outline
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(V3PanelShape)
            .background(HomeV3.Surface)
            .drawBehind {
                // `border-dashed`: a 1dp dashed outline inside the 16dp corners.
                val stroke = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx())))
                drawRoundRect(color = outline, cornerRadius = CornerRadius(16.dp.toPx()), style = stroke)
            }
            .padding(horizontal = 24.dp, vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (icon != null) {
            Box(
                modifier = Modifier.size(56.dp).clip(CircleShape).background(HomeV3.SurfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = HomeV3.OnSurfaceVariant, modifier = Modifier.size(26.dp))
            }
        }
        if (title != null) Text(text = title, color = HomeV3.OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(text = text, color = HomeV3.OnSurfaceVariant, fontSize = 13.sp, lineHeight = 19.sp, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(modifier = Modifier.height(2.dp))
            action()
        }
    }
}

/** The centred spinner the web draws while a list is first loading (`Loader2` in accent). */
@Composable
internal fun V3Loading(modifier: Modifier = Modifier, height: Dp = 96.dp) {
    Box(modifier = modifier.fillMaxWidth().height(height), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = HomeV3.Purple, modifier = Modifier.size(22.dp), strokeWidth = 2.5.dp)
    }
}

/** A `role="alert"` line in the rose tone, with the retry the web offers where it does. */
@Composable
internal fun V3ErrorLine(message: String, modifier: Modifier = Modifier, retryText: String? = null, onRetry: (() -> Unit)? = null) {
    Column(modifier = modifier.fillMaxWidth().padding(vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(text = message, color = V3Tone.Rose, fontSize = 13.sp, textAlign = TextAlign.Center)
        if (retryText != null && onRetry != null) V3OutlinePill(text = retryText, onClick = onRetry)
    }
}

/** One glyph tile (`h-9 w-9 rounded-lg`) in a tone — the row leading on the personal surfaces. */
@Composable
internal fun V3GlyphTile(icon: ImageVector, tint: Color, size: Dp = 36.dp, radius: Dp = 10.dp, iconSize: Dp = 16.dp) {
    Box(
        modifier = Modifier.size(size).clip(RoundedCornerShape(radius)).background(tint.copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(iconSize))
    }
}

/** The elevated row (`rounded-xl p-2.5 bg-panel-elevated`) lists are built from. */
@Composable
internal fun V3ElevatedRow(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable RowScope.() -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(HomeV3.SurfaceVariant)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}
