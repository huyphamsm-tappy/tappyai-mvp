package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * REGRESSION (permanent): a shopping reply rendered the raw `[CTA_BUTTONS]{…}` JSON as text.
 *
 * Captured verbatim from production on the SM-A127F (vc12, 2026-08-27 16:2x, account
 * miastore2803@gmail.com) while verifying the live Shopping path. The block stayed on screen long
 * after the stream finished, so this was the final render, not a streaming artifact.
 *
 * Cause: the no-closing-tag fallback was anchored to the end of the content
 * (`\[CTA_BUTTONS\](\{[\s\S]*\})\s*$`). The model emits `[FOLLOWUPS]` after the CTA block, and
 * followups are parsed AFTER the CTA step — so at CTA time something still followed the block, the
 * anchor failed, nothing was stripped, and once the followups line was removed the CTA JSON was
 * left orphaned in the visible text.
 *
 * The fix locates the block's JSON by brace matching rather than by anchoring, so it works wherever
 * the block sits. Brace matching is used instead of a looser regex because `[\s\S]*\}` un-anchored
 * would run greedily to the last `}` in the message and swallow legitimate trailing prose.
 */
class CtaMarkerLeakTest {

    /** The exact bytes observed on the device, including the trailing followups line. */
    private val productionReply =
        "I'll search for iPhone 17 ProMax cases for you.\n" +
            "Both are MagSafe-compatible, which is handy. 👍\n" +
            """[CTA_BUTTONS]{"buttons":[{"label":"🛒 Shopee","type":"search","url":"https://shopee.vn/search?keyword=%E1%BB%91p+l%C6%B0ng+iPhone+17+ProMax","primary":true},{"label":"📦 Lazada","type":"search","url":"https://www.lazada.vn/catalog/?q=%E1%BB%91p+l%C6%B0ng+iPhone+17+ProMax","primary":false},{"label":"🛍️ Tiki","type":"search","url":"https://tiki.vn/search?q=%E1%BB%91p+l%C6%B0ng+iPhone+17+ProMax","primary":false}]}""" +
            "\n[FOLLOWUPS]Ốp nào chống sốc tốt?|Có ốp trong suốt không?|Giá rẻ hơn ở đâu?"

    @Test
    fun `the production reply must not leak the raw CTA block`() {
        val parsed = ChatResponseParser.parse(productionReply)

        assertTrue("no CTA marker may reach the user", !parsed.text.contains("CTA_BUTTONS"))
        assertTrue("no raw JSON may reach the user", !parsed.text.contains("\"buttons\""))
        assertTrue("no raw url may reach the user", !parsed.text.contains("shopee.vn/search"))
        assertEquals(
            "I'll search for iPhone 17 ProMax cases for you.\n" +
                "Both are MagSafe-compatible, which is handy. 👍",
            parsed.text,
        )
    }

    @Test
    fun `the buttons are still decoded, not merely stripped`() {
        val parsed = ChatResponseParser.parse(productionReply)

        assertEquals(3, parsed.ctaButtons.size)
        assertEquals("🛒 Shopee", parsed.ctaButtons[0].label)
        assertEquals("https://shopee.vn/search?keyword=%E1%BB%91p+l%C6%B0ng+iPhone+17+ProMax",
            parsed.ctaButtons[0].url)
        assertTrue(parsed.ctaButtons[0].primary)
    }

    @Test
    fun `followups on the line after the CTA block still parse`() {
        val parsed = ChatResponseParser.parse(productionReply)
        assertEquals(
            listOf("Ốp nào chống sốc tốt?", "Có ốp trong suốt không?", "Giá rẻ hơn ở đâu?"),
            parsed.followups,
        )
    }

    // The shape that already worked must keep working.
    @Test
    fun `a CTA block at the very end still parses and strips`() {
        val reply = """Đi thử nhé.
[CTA_BUTTONS]{"buttons":[{"label":"Bản đồ","type":"maps","url":"https://maps.example","primary":true}]}"""

        val parsed = ChatResponseParser.parse(reply)

        assertEquals("Đi thử nhé.", parsed.text)
        assertEquals(1, parsed.ctaButtons.size)
        assertEquals("Bản đồ", parsed.ctaButtons[0].label)
    }

    @Test
    fun `the closing-tag form still parses and strips`() {
        val reply = """Xong.
[CTA_BUTTONS]{"buttons":[{"label":"Gọi","type":"call","url":"tel:123","primary":false}]}[/CTA_BUTTONS]
Còn gì nữa không?"""

        val parsed = ChatResponseParser.parse(reply)

        assertTrue(!parsed.text.contains("CTA_BUTTONS"))
        assertTrue("prose after the block must survive", parsed.text.contains("Còn gì nữa không?"))
        assertEquals(1, parsed.ctaButtons.size)
    }

    // Brace matching must stop at the block's own closing brace, never run to the last `}` in the
    // message - that is the trap a looser un-anchored regex would fall into.
    @Test
    fun `prose containing braces after the block is not swallowed`() {
        val reply = """Mở app nhé.
[CTA_BUTTONS]{"buttons":[{"label":"Mở","type":"search","url":"https://x.example","primary":true}]}
Ghi chú: cú pháp là {"key": "value"} nhé."""

        val parsed = ChatResponseParser.parse(reply)

        assertTrue(!parsed.text.contains("CTA_BUTTONS"))
        assertTrue("trailing prose must survive", parsed.text.contains("Ghi chú"))
        assertTrue("the example JSON in prose must survive", parsed.text.contains("""{"key": "value"}"""))
        assertEquals(1, parsed.ctaButtons.size)
    }

    @Test
    fun `a malformed CTA block is stripped even though no buttons can be decoded`() {
        val reply = "Trước.\n[CTA_BUTTONS]{not valid json}\nSau."

        val parsed = ChatResponseParser.parse(reply)

        assertTrue("a leak is worse than a missing button row", !parsed.text.contains("CTA_BUTTONS"))
        assertTrue(!parsed.text.contains("not valid json"))
        assertTrue(parsed.ctaButtons.isEmpty())
        assertTrue(parsed.text.contains("Sau."))
    }

    @Test
    fun `an unclosed CTA block cannot leak while streaming`() {
        val midStream = """Đang tìm…
[CTA_BUTTONS]{"buttons":[{"label":"Sho"""

        val parsed = ChatResponseParser.parse(midStream)

        assertTrue(!parsed.text.contains("CTA_BUTTONS"))
        assertTrue(!parsed.text.contains("\"buttons\""))
        assertEquals("Đang tìm…", parsed.text)
    }

    @Test
    fun `an orphan CTA tag alone never shows`() {
        assertTrue(!ChatResponseParser.parse("Xong. [CTA_BUTTONS]").text.contains("CTA_BUTTONS"))
        assertTrue(!ChatResponseParser.parse("Xong. [/CTA_BUTTONS]").text.contains("CTA_BUTTONS"))
    }

    @Test
    fun `a reply with no CTA block is untouched`() {
        val prose = "Mình chọn Quán hủ tiếu thả - Dì Ba — 4.6⭐ (57 đánh giá)."
        assertEquals(prose, ChatResponseParser.parse(prose).text)
    }
}
