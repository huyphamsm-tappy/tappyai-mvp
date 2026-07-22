package com.tappyai.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.TappyWindowWidthClass
import com.tappyai.core.designsystem.theme.currentWindowWidthClass

enum class TappyChatRole { User, Assistant }

/**
 * Chat message bubble (docs/UI_GUIDELINES.md §14) — **layout and styling only**. User messages
 * are right-aligned, filled, width-capped (85% compact / 75% expanded window); assistant
 * messages are left-aligned and may use the full column width for readable long-form content.
 *
 * The message body is a [content] slot rather than a `String`, so the bubble stays ignorant of
 * *how* text is rendered: callers put plain [Text] for user input and [TappyMarkdown] for
 * assistant output. The bubble owns the content color and base text style for each role (via
 * `LocalContentColor`/`ProvideTextStyle`), so the slot content inherits them without the caller
 * repeating them — and Markdown rendering never leaks into this component.
 */
@Composable
fun TappyChatBubble(
    role: TappyChatRole,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val isExpanded = currentWindowWidthClass() != TappyWindowWidthClass.Compact
    val maxWidthFraction = if (isExpanded) 0.75f else 0.85f

    Box(modifier = modifier.fillMaxWidth()) {
        when (role) {
            TappyChatRole.User -> Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .widthIn(max = TappyContainers.content)
                    .fillMaxWidth(maxWidthFraction)
                    .background(MaterialTheme.colorScheme.primary, TappyShapes.card)
                    .padding(horizontal = TappySpacing.xl, vertical = TappySpacing.lg),
            ) {
                StyledMessageContent(color = MaterialTheme.colorScheme.onPrimary, content = content)
            }

            TappyChatRole.Assistant -> Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .widthIn(max = TappyContainers.content)
                    .fillMaxWidth()
                    .padding(vertical = TappySpacing.md),
            ) {
                StyledMessageContent(color = MaterialTheme.colorScheme.onSurface, content = content)
            }
        }
    }
}

@Composable
private fun StyledMessageContent(color: androidx.compose.ui.graphics.Color, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalContentColor provides color) {
        ProvideTextStyle(MaterialTheme.typography.bodyLarge) { content() }
    }
}

@TappyComponentPreviews
@Composable
private fun TappyChatBubblePreview() {
    TappyAITheme(dynamicColor = false) {
        Column(modifier = Modifier.padding(TappySpacing.xl)) {
            TappyChatBubble(role = TappyChatRole.User) {
                Text("Quán phở nào ngon gần đây?")
            }
            TappyChatBubble(role = TappyChatRole.Assistant) {
                TappyMarkdown("Gợi ý cho bạn vài **quán phở** được đánh giá cao gần đây…")
            }
        }
    }
}
