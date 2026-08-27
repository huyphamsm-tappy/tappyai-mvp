package com.tappyai.core.designsystem.component

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * REGRESSION (permanent): a bolded markdown link rendered as RAW MARKDOWN on Android.
 *
 * Observed in production on the SM-A127F — a hotel reply showed the literal characters
 * `**[Golden Line Hotel Danang](https://www.booking.com/…)**` instead of a bold, clickable hotel
 * name. Cause: the bold branch of `buildInlineAnnotated` did `append(text.substring(i + 2, end))`,
 * emitting the span's content as literal text so nested markup was never parsed. Italic had the
 * same defect, and link text could not carry emphasis.
 *
 * Prompt rule R13 asks the model to write hotel names as markdown links, and the model bolds the
 * name it recommends — so this shape is common, not exotic.
 *
 * `buildInlineAnnotated` returns an `AnnotatedString`, which is plain data: these assertions read
 * its spans and annotations directly, with no Compose UI test harness or device.
 */
class TappyMarkdownInlineTest {

    private val codeBg = Color(0xFFEEEEEE)
    private val linkColor = Color(0xFF0066CC)

    private fun build(md: String): AnnotatedString =
        buildInlineAnnotated(md, codeBackground = codeBg, linkColor = linkColor)

    /** The URL of the first link annotation covering [index], or null when there is none. */
    private fun linkUrlAt(a: AnnotatedString, index: Int): String? =
        a.getLinkAnnotations(index, index + 1)
            .firstOrNull()
            ?.let { (it.item as? LinkAnnotation.Url)?.url }

    private fun isBoldAt(a: AnnotatedString, index: Int): Boolean =
        a.spanStyles.any { index >= it.start && index < it.end && it.item.fontWeight == FontWeight.Bold }

    private fun isItalicAt(a: AnnotatedString, index: Int): Boolean =
        a.spanStyles.any { index >= it.start && index < it.end && it.item.fontStyle == FontStyle.Italic }

    // CASE 1 — the exact production defect.
    @Test
    fun `bold wrapped link renders as bold clickable text, not raw markdown`() {
        val a = build("**[Hotel](https://example.com)**")

        assertEquals("Hotel", a.text)
        assertTrue("no raw brackets may survive", !a.text.contains("["))
        assertTrue("no raw url may survive", !a.text.contains("https://"))
        assertTrue("link text must be bold", isBoldAt(a, 0))
        assertEquals("link must be clickable", "https://example.com", linkUrlAt(a, 0))
    }

    // CASE 2 — a plain link still works.
    @Test
    fun `plain link is unchanged`() {
        val a = build("[Hotel](https://example.com)")
        assertEquals("Hotel", a.text)
        assertEquals("https://example.com", linkUrlAt(a, 0))
        assertTrue("a plain link is not bold", !isBoldAt(a, 0))
    }

    // CASE 3 — plain bold still works.
    @Test
    fun `plain bold is unchanged`() {
        val a = build("**Hotel**")
        assertEquals("Hotel", a.text)
        assertTrue(isBoldAt(a, 0))
        assertNull("plain bold carries no link", linkUrlAt(a, 0))
    }

    // CASE 4 — bold text containing a nested link: both must apply, to the right ranges.
    @Test
    fun `bold text with a nested link keeps both bold and the link`() {
        val a = build("**Hotel [details](https://example.com)**")

        assertEquals("Hotel details", a.text)
        val detailsAt = a.text.indexOf("details")
        assertTrue("the leading word is bold", isBoldAt(a, 0))
        assertTrue("the nested link text is also bold", isBoldAt(a, detailsAt))
        assertEquals("nested link is clickable", "https://example.com", linkUrlAt(a, detailsAt))
        assertNull("the non-link part carries no link", linkUrlAt(a, 0))
    }

    // CASE 5 — emphasis inside link text.
    @Test
    fun `link text containing bold keeps the link and the emphasis`() {
        val a = build("[Hotel **details**](https://example.com)")

        assertEquals("Hotel details", a.text)
        val detailsAt = a.text.indexOf("details")
        assertEquals("whole label is clickable", "https://example.com", linkUrlAt(a, 0))
        assertEquals("including the emphasised part", "https://example.com", linkUrlAt(a, detailsAt))
        assertTrue("the emphasised part is bold", isBoldAt(a, detailsAt))
        assertTrue("the plain part is not bold", !isBoldAt(a, 0))
    }

    // CASE 6 — malformed input must never crash, and must degrade to literal text.
    @Test
    fun `malformed markdown does not crash`() {
        val malformed = listOf(
            "**unterminated bold",
            "[label](unclosed",
            "[label]no-paren",
            "`unterminated code",
            "**",
            "*",
            "[]()",
            "**[]()**",
            "***",
            "**[a](b)",
            "_",
            "",
        )
        for (md in malformed) {
            val a = build(md) // must not throw
            assertNotNull(md, a)
        }
    }

    @Test
    fun `pathological nesting is bounded and does not overflow the stack`() {
        // Alternating emphasis markers nest one level per pair; the depth cap turns the remainder
        // into literal text rather than recursing without bound.
        val a = build("_".repeat(64) + "x" + "_".repeat(64))
        assertNotNull(a)
        assertTrue("some content survives", a.text.contains("x"))
    }

    // Guards that the fix did not disturb the rest of the inline grammar.
    @Test
    fun `italic still renders and now supports a nested link`() {
        val plain = build("*soon*")
        assertEquals("soon", plain.text)
        assertTrue(isItalicAt(plain, 0))

        val nested = build("*see [here](https://example.com)*")
        assertEquals("see here", nested.text)
        val hereAt = nested.text.indexOf("here")
        assertTrue(isItalicAt(nested, hereAt))
        assertEquals("https://example.com", linkUrlAt(nested, hereAt))
    }

    @Test
    fun `code span content stays literal — markup inside code is content, not formatting`() {
        val a = build("`**not bold**`")
        assertEquals("**not bold**", a.text)
        assertTrue("code content must not be bolded", !isBoldAt(a, 2))
    }

    @Test
    fun `plain text passes through untouched`() {
        val a = build("Quán hủ tiếu thả - Dì Ba, 4.6 sao")
        assertEquals("Quán hủ tiếu thả - Dì Ba, 4.6 sao", a.text)
    }

    @Test
    fun `the real production hotel string renders correctly`() {
        val a = build("Mình chọn **[Golden Line Hotel Danang](https://www.booking.com/hotel/vn/golden-line-danang.vi.html)** — gần sân bay.")

        assertEquals("Mình chọn Golden Line Hotel Danang — gần sân bay.", a.text)
        assertTrue("no raw markdown may reach the user", !a.text.contains("]("))
        assertTrue("no raw url may reach the user", !a.text.contains("booking.com"))
        val nameAt = a.text.indexOf("Golden")
        assertTrue(isBoldAt(a, nameAt))
        assertEquals(
            "https://www.booking.com/hotel/vn/golden-line-danang.vi.html",
            linkUrlAt(a, nameAt),
        )
        assertNull("surrounding prose is not a link", linkUrlAt(a, 0))
    }
}
