package com.tappyai.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.tappyai.core.designsystem.theme.TappyAITheme
import com.tappyai.core.designsystem.theme.TappyShapes
import com.tappyai.core.designsystem.theme.TappySpacing

/**
 * Lightweight, **dependency-free** Markdown renderer. Deliberately not a full CommonMark
 * implementation — it covers the MVP subset only:
 *   headings (#/##/###), **bold**, *italic*, `inline code`, fenced ``` code blocks,
 *   bullet lists, numbered lists, > blockquotes, --- horizontal rules, and [links](url)
 *   rendered as styled text (no click handling yet).
 * Explicitly out of scope: tables, raw HTML, nested lists, task lists, LaTeX, Mermaid,
 * markdown images.
 *
 * **The public API is intentionally just `TappyMarkdown(markdown, modifier)`** so the internals
 * can later be swapped for a full Markdown library without touching a single call site. It
 * renders with the ambient `LocalContentColor` / `LocalTextStyle` (Material `Text` defaults),
 * so the *caller* (e.g. [TappyChatBubble]) owns color and base typography — this component owns
 * only the Markdown-to-UI mapping.
 */
@Composable
fun TappyMarkdown(
    markdown: String,
    modifier: Modifier = Modifier,
) {
    val blocks = remember(markdown) { parseMarkdownBlocks(markdown) }
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(TappySpacing.md),
    ) {
        blocks.forEach { block -> MarkdownBlock(block) }
    }
}

// ---------------------------------------------------------------------------------------------
// Block model + parser (pure Kotlin, no Compose — trivially unit-testable and lib-swappable).
// ---------------------------------------------------------------------------------------------

private sealed interface MdBlock {
    data class Heading(val level: Int, val text: String) : MdBlock
    data class Paragraph(val text: String) : MdBlock
    data class CodeBlock(val code: String) : MdBlock
    data class BulletList(val items: List<String>) : MdBlock
    data class NumberedList(val items: List<String>) : MdBlock
    data class Quote(val text: String) : MdBlock
    data object Rule : MdBlock
}

private val HEADING_REGEX = Regex("^(#{1,3})\\s+(.*)$")
private val BULLET_REGEX = Regex("^\\s*[-*]\\s+(.*)$")
private val NUMBERED_REGEX = Regex("^\\s*\\d+\\.\\s+(.*)$")
private val RULE_REGEX = Regex("^\\s*([-*_])\\1{2,}\\s*$")
private val QUOTE_REGEX = Regex("^\\s*>\\s?(.*)$")
private val FENCE_REGEX = Regex("^\\s*```.*$")

private fun parseMarkdownBlocks(markdown: String): List<MdBlock> {
    val lines = markdown.replace("\r\n", "\n").split("\n")
    val blocks = mutableListOf<MdBlock>()
    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        when {
            line.isBlank() -> i++

            FENCE_REGEX.matches(line) -> {
                val code = StringBuilder()
                i++
                while (i < lines.size && !FENCE_REGEX.matches(lines[i])) {
                    code.append(lines[i]).append('\n')
                    i++
                }
                if (i < lines.size) i++ // consume the closing fence
                blocks += MdBlock.CodeBlock(code.toString().trimEnd('\n'))
            }

            // Rule is checked before bullet so "---" isn't mistaken for a "-" list item.
            RULE_REGEX.matches(line) -> {
                blocks += MdBlock.Rule
                i++
            }

            HEADING_REGEX.matches(line) -> {
                val match = HEADING_REGEX.find(line)!!
                blocks += MdBlock.Heading(match.groupValues[1].length, match.groupValues[2].trim())
                i++
            }

            QUOTE_REGEX.matches(line) -> {
                val quote = StringBuilder()
                while (i < lines.size && QUOTE_REGEX.matches(lines[i])) {
                    quote.append(QUOTE_REGEX.find(lines[i])!!.groupValues[1]).append('\n')
                    i++
                }
                blocks += MdBlock.Quote(quote.toString().trim())
            }

            BULLET_REGEX.matches(line) -> {
                val items = mutableListOf<String>()
                while (i < lines.size && BULLET_REGEX.matches(lines[i])) {
                    items += BULLET_REGEX.find(lines[i])!!.groupValues[1]
                    i++
                }
                blocks += MdBlock.BulletList(items)
            }

            NUMBERED_REGEX.matches(line) -> {
                val items = mutableListOf<String>()
                while (i < lines.size && NUMBERED_REGEX.matches(lines[i])) {
                    items += NUMBERED_REGEX.find(lines[i])!!.groupValues[1]
                    i++
                }
                blocks += MdBlock.NumberedList(items)
            }

            else -> {
                // Paragraph: fold consecutive plain lines into one, until a blank or a line that
                // starts a different block type.
                val paragraph = StringBuilder()
                while (i < lines.size && lines[i].isNotBlank() &&
                    !FENCE_REGEX.matches(lines[i]) && !RULE_REGEX.matches(lines[i]) &&
                    !HEADING_REGEX.matches(lines[i]) && !QUOTE_REGEX.matches(lines[i]) &&
                    !BULLET_REGEX.matches(lines[i]) && !NUMBERED_REGEX.matches(lines[i])
                ) {
                    if (paragraph.isNotEmpty()) paragraph.append(' ')
                    paragraph.append(lines[i].trim())
                    i++
                }
                blocks += MdBlock.Paragraph(paragraph.toString())
            }
        }
    }
    return blocks
}

// ---------------------------------------------------------------------------------------------
// Inline formatting: **bold**, *italic*/_italic_, `code`, [text](url). A single left-to-right
// scan; any unterminated marker is emitted literally.
// ---------------------------------------------------------------------------------------------

private fun buildInlineAnnotated(
    text: String,
    codeBackground: Color,
    linkColor: Color,
): AnnotatedString = buildAnnotatedString {
    var i = 0
    val n = text.length
    while (i < n) {
        val c = text[i]
        when {
            c == '`' -> {
                val end = text.indexOf('`', i + 1)
                if (end > i) {
                    withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = codeBackground)) {
                        append(text.substring(i + 1, end))
                    }
                    i = end + 1
                } else {
                    append(c); i++
                }
            }
            c == '*' && i + 1 < n && text[i + 1] == '*' -> {
                val end = text.indexOf("**", i + 2)
                if (end > i) {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        append(text.substring(i + 2, end))
                    }
                    i = end + 2
                } else {
                    append(c); i++
                }
            }
            c == '*' || c == '_' -> {
                val end = text.indexOf(c, i + 1)
                if (end > i) {
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                        append(text.substring(i + 1, end))
                    }
                    i = end + 1
                } else {
                    append(c); i++
                }
            }
            c == '[' -> {
                val closeBracket = text.indexOf(']', i + 1)
                if (closeBracket > i && closeBracket + 1 < n && text[closeBracket + 1] == '(') {
                    val closeParen = text.indexOf(')', closeBracket + 2)
                    if (closeParen > closeBracket) {
                        val linkText = text.substring(i + 1, closeBracket)
                        val url = text.substring(closeBracket + 2, closeParen)
                        // Real clickable link: withLink + LinkAnnotation.Url. With no explicit
                        // listener, the Text opens it through the ambient UriHandler, i.e. the
                        // system browser (Intent.ACTION_VIEW) — no in-app browser, no analytics.
                        withLink(
                            LinkAnnotation.Url(
                                url = url,
                                styles = TextLinkStyles(
                                    style = SpanStyle(
                                        color = linkColor,
                                        textDecoration = TextDecoration.Underline,
                                    ),
                                ),
                            ),
                        ) {
                            append(linkText)
                        }
                        i = closeParen + 1
                    } else {
                        append(c); i++
                    }
                } else {
                    append(c); i++
                }
            }
            else -> {
                append(c); i++
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Block renderers.
// ---------------------------------------------------------------------------------------------

@Composable
private fun MarkdownBlock(block: MdBlock) {
    when (block) {
        is MdBlock.Heading -> {
            val style = when (block.level) {
                1 -> MaterialTheme.typography.headlineSmall
                2 -> MaterialTheme.typography.titleLarge
                else -> MaterialTheme.typography.titleMedium
            }
            Text(text = inlineText(block.text), style = style)
        }
        is MdBlock.Paragraph -> Text(text = inlineText(block.text))
        is MdBlock.CodeBlock -> MarkdownCodeBlock(block.code)
        is MdBlock.BulletList -> Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            block.items.forEach { item -> MarkdownListItem(marker = "•", text = item) }
        }
        is MdBlock.NumberedList -> Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
            block.items.forEachIndexed { index, item ->
                MarkdownListItem(marker = "${index + 1}.", text = item)
            }
        }
        is MdBlock.Quote -> MarkdownQuote(block.text)
        MdBlock.Rule -> HorizontalDivider()
    }
}

@Composable
private fun MarkdownListItem(marker: String, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(TappySpacing.sm)) {
        Text(text = marker)
        Text(text = inlineText(text), modifier = Modifier.weight(1f))
    }
}

@Composable
private fun MarkdownCodeBlock(code: String) {
    val clipboard = LocalClipboardManager.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(TappyShapes.input)
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        // Code scrolls horizontally; the end padding reserves room so short lines don't run
        // under the copy button pinned at the top-right (the button itself doesn't scroll).
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(TappySpacing.md)
                .padding(end = TappySpacing.huge),
        ) {
            Text(
                text = code,
                fontFamily = FontFamily.Monospace,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // Copy only — no syntax highlighting, no language detection. Uses the same block
        // background so scrolled-under code doesn't show through the button.
        IconButton(
            onClick = { clipboard.setText(AnnotatedString(code)) },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Icon(
                imageVector = Icons.Filled.ContentCopy,
                contentDescription = "Copy code",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun MarkdownQuote(text: String) {
    Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.outline),
        )
        Spacer(modifier = Modifier.width(TappySpacing.md))
        Text(
            text = inlineText(text),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun inlineText(text: String): AnnotatedString {
    val codeBackground = MaterialTheme.colorScheme.surfaceVariant
    val linkColor = MaterialTheme.colorScheme.primary
    return remember(text, codeBackground, linkColor) {
        buildInlineAnnotated(text, codeBackground, linkColor)
    }
}

@TappyComponentPreviews
@Composable
private fun TappyMarkdownPreview() {
    TappyAITheme(dynamicColor = false) {
        TappyMarkdown(
            markdown = """
                # Heading 1
                A paragraph with **bold**, *italic*, `inline code` and a [link](https://x).

                - First bullet
                - Second bullet

                1. Step one
                2. Step two

                > A blockquote line.

                ```
                val x = 1
                ```

                ---
            """.trimIndent(),
            modifier = Modifier.padding(TappySpacing.xl),
        )
    }
}
