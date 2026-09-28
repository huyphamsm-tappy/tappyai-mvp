package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.MarkdownNormalize
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Owner UAT blocker 2026-09-28: literal "**" in chat answers, every vertical. TappyMarkdown emitted
 * an unterminated `**` literally and cards printed markdown from the JSON raw. Same cases as web
 * `src/lib/chat/markdownNormalize.test.ts`.
 */
class ChatNoLiteralBoldTest {

    private fun b(s: String) = MarkdownNormalize.balanceBold(s)

    @Test
    fun `matched pair is kept`() {
        assertEquals("Quán **Phở Gà** ngon", b("Quán **Phở Gà** ngon"))
    }

    @Test
    fun `orphan at line end is dropped`() {
        assertEquals("Giá tốt nhất ", b("Giá tốt nhất **"))
        assertEquals("Tổng ước tính", b("**Tổng ước tính"))
        assertEquals("**a** và b", b("**a** và **b"))
        assertEquals("a b **c** d", b("a** b **c** d"))
    }

    @Test
    fun `pair across a line break is not a pair`() {
        assertEquals("Ngày 1\nđi chơi", MarkdownNormalize.balanceBoldPerLine("**Ngày 1\nđi chơi**"))
    }

    @Test
    fun `inner spaces are trimmed`() {
        assertEquals("**text**", b("** text**"))
    }

    @Test
    fun `triple and empty runs`() {
        assertEquals("**Đà Lạt**", b("***Đà Lạt***"))
        assertEquals("**Lưu ý:** abc", b("**Lưu ý:*** abc"))
        assertEquals("", b("***"))
        assertEquals("a b", b("a **** b"))
        assertEquals("a b", b("a ** ** b"))
    }

    @Test
    fun `nested or unbalanced never leaves an odd delimiter`() {
        for (s in listOf("**a **b** c**", "**a **b", "****x", "x**y**z**", "** ** **", "**4.7⭐")) {
            val out = b(s)
            assertEquals("$s -> $out", 0, Regex("""\*\*""").findAll(out).count() % 2)
        }
        assertEquals("2*3 = 6", b("2*3 = 6"))
    }

    @Test
    fun `plainText strips card field markdown`() {
        assertEquals("4.7⭐", MarkdownNormalize.plainText("**4.7⭐**"))
        assertEquals("4.7⭐", MarkdownNormalize.plainText("**4.7⭐"))
        assertEquals("Ăn bún chả ở Hàng Mành", MarkdownNormalize.plainText("Ăn **bún chả** ở `Hàng Mành`"))
        assertEquals("Xem Booking", MarkdownNormalize.plainText("Xem [Booking](https://booking.com/x)"))
        assertEquals("rất đẹp", MarkdownNormalize.plainText("*rất* đẹp"))
        assertEquals("2*3 phòng", MarkdownNormalize.plainText("2*3 phòng"))
        assertEquals("photo_url", MarkdownNormalize.plainText("photo_url"))
    }

    @Test
    fun `parser strips markdown inside plan, cta and followups`() {
        val reply = "Gợi ý cho bạn **\n" +
            "[TAPPY_PLAN]{\"type\":\"trip\",\"title\":\"**Đà Lạt**\",\"days\":[{\"label\":\"Ngày 1\",\"items\":[" +
            "{\"time\":\"08:00\",\"name\":\"**Quán A**\",\"description\":\"Đánh giá **4.7⭐\",\"maps_link\":\"https://maps.google.com/?q=a**b\"}]}]," +
            "\"cost_breakdown\":{\"**Ăn uống**\":\"**1 triệu**\"}}[/TAPPY_PLAN]\n" +
            "[CTA_BUTTONS]{\"buttons\":[{\"label\":\"**Đặt ngay**\",\"type\":\"booking\",\"url\":\"https://x.vn/a\"}]}[/CTA_BUTTONS]\n" +
            "[FOLLOWUPS]**Giá**?|Còn quán khác?[/FOLLOWUPS]"
        val parsed = ChatResponseParser.parse(reply)
        val plan = parsed.plan!!
        assertEquals("Đà Lạt", plan.title)
        val item = plan.days[0].items[0]
        assertEquals("Quán A", item.name)
        assertEquals("Đánh giá 4.7⭐", item.description)
        assertEquals("https://maps.google.com/?q=a**b", item.mapsLink)
        assertEquals(mapOf("Ăn uống" to "1 triệu"), plan.costBreakdown)
        assertEquals("Đặt ngay", parsed.ctaButtons.single().label)
        assertEquals(listOf("Giá?", "Còn quán khác?"), parsed.followups)
        assertFalse(parsed.text.contains("[TAPPY_PLAN]"))
    }

    @Test
    fun `renderer source balances before parsing`() {
        val candidates = listOf(
            "core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyMarkdown.kt",
            "../core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyMarkdown.kt",
            "android/core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyMarkdown.kt",
        )
        val file = candidates.map { java.io.File(it) }.firstOrNull { it.exists() } ?: return
        // forRender = balanceBoldPerLine(separateGluedLinks(…)) since 2026-09-28 (golden glued links).
        val src = file.readText()
        assertTrue(src.contains("parseMarkdownBlocks(MarkdownNormalize.forRender(markdown))"))
        assertTrue(java.io.File(file.parentFile, "MarkdownNormalize.kt").readText().contains("fun forRender(text: String): String = balanceBoldPerLine("))
    }
}
