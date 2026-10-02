package com.tappyai.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * The standard tappable list row for menu/settings surfaces (Profile, Settings, Membership,
 * Payment, Rewards, About, Privacy, Notifications, Help, …). Structure mirrors the web app's
 * `MenuItem`: a rounded icon tile, a title with optional [subtitle], an optional right-aligned
 * [valueText] (e.g. the current Language), and a trailing chevron.
 *
 * Generic and product-agnostic: it takes primitives only (no Profile/feature coupling). Group
 * several inside a `TappyCard(contentPadding = PaddingValues(0.dp))` separated by
 * `HorizontalDivider`s for the web's "card with divide-y" section look.
 *
 * [danger] renders the destructive style (red icon tile + red title), for rows like "Sign out".
 */
@Composable
fun TappyMenuRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    valueText: String? = null,
    showChevron: Boolean = true,
    danger: Boolean = false,
    /** V3 (2026-09-14): a solid accent tile with a white glyph instead of the neutral tile.
     *  Null keeps the neutral tile — every existing caller is unchanged. */
    accent: Color? = null,
    /** V3: the trailing value's colour (e.g. a green "On"). Null keeps the muted default. */
    valueColor: Color? = null,
    /** V3: the title's weight. Null keeps the default (regular). */
    titleFontWeight: FontWeight? = null,
) {
    val colors = MaterialTheme.colorScheme
    val tileBackground = accent ?: if (danger) colors.errorContainer else colors.surfaceVariant
    val iconTint = if (accent != null) Color.White else if (danger) colors.error else colors.onSurfaceVariant
    val titleColor = if (danger) colors.error else colors.onSurface

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TappySpacing.lg),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(TappyShapes.input)
                .background(tileBackground),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.bodyLarge, color = titleColor, fontWeight = titleFontWeight)
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (valueText != null) {
            Text(
                text = valueText,
                style = MaterialTheme.typography.bodyMedium,
                color = valueColor ?: colors.onSurfaceVariant,
                fontWeight = if (valueColor != null) FontWeight.SemiBold else null,
            )
        }
        if (showChevron) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.onSurfaceVariant,
            )
        }
    }
}

@TappyComponentPreviews
@Composable
private fun TappyMenuRowPreview() {
    TappyAITheme(dynamicColor = false) {
        TappyCard(
            modifier = Modifier.padding(TappySpacing.xl),
            contentPadding = PaddingValues(0.dp),
        ) {
            TappyMenuRow(icon = Icons.Filled.Notifications, title = "Notifications", onClick = {})
            HorizontalDivider()
            TappyMenuRow(
                icon = Icons.Filled.Language,
                title = "Language",
                valueText = "English",
                onClick = {},
            )
        }
    }
}
