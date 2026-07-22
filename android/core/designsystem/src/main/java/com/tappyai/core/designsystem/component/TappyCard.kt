package com.tappyai.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyElevation
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Base surface for the library's card-based components (docs/UI_GUIDELINES.md §11).
 * Dark theme uses a border instead of a shadow (§8's "shadows read poorly on dark" rule);
 * light theme uses [TappyElevation.low].
 *
 * [contentPadding] defaults to the standard inset, but a caller can pass `PaddingValues(0.dp)`
 * for edge-to-edge content — e.g. a menu-row list ([TappyMenuRow]) whose rows own their own
 * padding and whose dividers should span the full card width.
 */
@Composable
fun TappyCard(
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(TappySpacing.xl),
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val isDark = isSystemInDarkTheme()

    Column(
        modifier = modifier
            .clip(TappyShapes.card)
            .let {
                if (isDark) it.border(1.dp, colors.outlineVariant, TappyShapes.card)
                else it.shadow(TappyElevation.low, TappyShapes.card, clip = false)
            }
            .background(colors.surface, TappyShapes.card)
            .padding(contentPadding),
        content = content,
    )
}

@TappyComponentPreviews
@Composable
private fun TappyCardPreview() {
    TappyAITheme(dynamicColor = false) {
        TappyCard(modifier = Modifier.padding(TappySpacing.xl)) {
            Text("Card content")
        }
    }
}
