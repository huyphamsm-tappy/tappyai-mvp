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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyContainers
import com.tappyai.core.designsystem.theme.TappySpacing
import com.tappyai.core.designsystem.theme.TappyWindowWidthClass
import com.tappyai.core.designsystem.theme.currentWindowWidthClass

enum class TappyChatRole { User, Assistant }

/** Web `--interactive` (src/app/globals.css): #0062CC, primary-600. */
private val WebInteractive = Color(0xFF0062CC)

/** Web `rounded-2xl rounded-br-md`: 16dp corners, the bottom-right one 6dp. */
private val WebUserBubbleShape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomEnd = 6.dp, bottomStart = 16.dp)

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
                    // Web final `ChatInterface.tsx` user message: `bg-interactive text-white rounded-2xl rounded-br-md px-4 py-2.5`
                    // (`--interactive` = #0062CC, white text 5.80:1, the same in light and dark). The Material `primary` of the dark scheme is a
                    // pale periwinkle, which made the Android bubble a different colour from the Web one.
                    .background(WebInteractive, WebUserBubbleShape)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                StyledMessageContent(color = Color.White, content = content)
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
