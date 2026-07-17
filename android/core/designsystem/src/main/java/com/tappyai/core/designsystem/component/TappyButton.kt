package com.tappyai.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyMinTouchTarget
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

enum class TappyButtonVariant { Primary, Secondary, Ghost, Destructive }
enum class TappyButtonSize { Small, Base, Large }

/**
 * One primary action per view (per docs/UI_GUIDELINES.md §9). Every size resolves to a
 * clickable target of at least [TappyMinTouchTarget] (48dp), even [TappyButtonSize.Small]
 * whose *visible* surface is smaller — padding grows the hit area rather than the label.
 * Loading state swaps the label for a spinner without changing the button's width.
 */
@Composable
fun TappyButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: TappyButtonVariant = TappyButtonVariant.Primary,
    size: TappyButtonSize = TappyButtonSize.Base,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: (@Composable () -> Unit)? = null,
) {
    val colors = MaterialTheme.colorScheme
    val (background, content) = when (variant) {
        TappyButtonVariant.Primary -> colors.primary to colors.onPrimary
        TappyButtonVariant.Secondary -> colors.secondaryContainer to colors.onSecondaryContainer
        TappyButtonVariant.Ghost -> Color.Transparent to colors.primary
        TappyButtonVariant.Destructive -> colors.error to colors.onError
    }
    val verticalPadding = when (size) {
        TappyButtonSize.Small -> TappySpacing.md
        TappyButtonSize.Base -> TappySpacing.lg
        TappyButtonSize.Large -> TappySpacing.lg + TappySpacing.xs
    }
    val isEnabled = enabled && !loading

    Box(
        modifier = modifier
            .defaultMinSize(minHeight = TappyMinTouchTarget)
            .background(if (isEnabled) background else background.copy(alpha = 0.5f), TappyShapes.card)
            .let {
                if (variant == TappyButtonVariant.Ghost) {
                    it.border(1.dp, colors.outline, TappyShapes.card)
                } else it
            }
            .clickable(enabled = isEnabled, onClick = onClick, role = Role.Button)
            .semantics {
                role = Role.Button
                if (!isEnabled) disabled()
            }
            .padding(horizontal = TappySpacing.xxl, vertical = verticalPadding),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = content,
                strokeWidth = 2.dp,
            )
        } else {
            Row(
                horizontalArrangement = Arrangement.spacedBy(TappySpacing.md, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (leadingIcon != null) {
                    androidx.compose.runtime.CompositionLocalProvider(LocalContentColor provides content) {
                        leadingIcon()
                    }
                }
                Text(
                    text = text,
                    color = content,
                    style = if (size == TappyButtonSize.Large) MaterialTheme.typography.titleLarge else MaterialTheme.typography.bodyLarge,
                )
            }
        }
    }
}

@TappyComponentPreviews
@Composable
private fun TappyButtonPreview() {
    TappyAITheme(dynamicColor = false) {
        Column(
            modifier = Modifier.padding(TappySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
        ) {
            TappyButton("Primary", onClick = {})
            TappyButton("Loading", onClick = {}, loading = true)
        }
    }
}
