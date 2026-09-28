package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.markdownVisibleText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Consult V2 ASK turn (server 70667d3) — port of web `parseAsk.test`-level behaviour, fed with the
 * reply UAT actually returned on 2026-09-29 for «đi du lịch Đà Nẵng 3 ngày 2 đêm» (web surface).
 */
class AskBlockTest {

    private val uatAsk = "Để mình gợi ý lịch trình phù hợp:\n\n" +
        "[TAPPY_ASK]{\"v\":1,\"questions\":[" +
        "{\"id\":\"departure\",\"q\":\"Bạn muốn khởi hành ngày nào?\",\"options\":[\"Tuần này\",\"Tuần sau\",\"Tháng sau\",\"Chưa định\"]}," +
        "{\"id\":\"party\",\"q\":\"Đi mấy người?\",\"options\":[\"1 người\",\"2 người\",\"3-5 người\",\"Nhóm đông\"]}," +
        "{\"id\":\"budget\",\"q\":\"Tầm bao nhiêu cho cả chuyến?\",\"options\":[\"Dưới 5 triệu\",\"5-10 triệu\",\"10-20 triệu\",\"Trên 20 triệu\"]}" +
        "]}[/TAPPY_ASK]\n\nBạn chọn nhanh bên dưới hoặc gõ tự do nhé."

    @Test fun `the UAT ask block becomes three questions and leaves no JSON`() {
        val p = ChatResponseParser.parse(uatAsk)
        assertEquals(listOf("departure", "party", "budget"), p.ask.map { it.id })
        assertEquals(listOf("1 người", "2 người", "3-5 người", "Nhóm đông"), p.ask[1].options)
        val visible = p.segments.filterIsInstance<ReplySegment.Text>().joinToString("\n") { markdownVisibleText(it.markdown) }
        assertFalse(visible, "TAPPY_ASK" in visible || "{" in visible)
        assertTrue(visible, "Để mình gợi ý lịch trình phù hợp:" in visible && "Bạn chọn nhanh" in visible)
    }

    @Test fun `a block still streaming is hidden, never shown half-written`() {
        val half = "Để mình hỏi nhanh:\n\n[TAPPY_ASK]{\"v\":1,\"questions\":[{\"id\":\"party\",\"q\":\"Đi mấy"
        val p = ChatResponseParser.parse(half)
        assertTrue(p.ask.isEmpty())
        assertFalse(p.streamText, "TAPPY_ASK" in p.streamText || "{" in p.streamText)
    }

    @Test fun `a malformed block is still removed and yields no questions`() {
        val p = ChatResponseParser.parse("Hỏi nhé [TAPPY_ASK]{not json[/TAPPY_ASK] xong")
        assertTrue(p.ask.isEmpty())
        assertFalse(p.text, "TAPPY_ASK" in p.text)
    }

    @Test fun `web rules - under 2 options dropped, options trimmed and capped at 4, at most 3 questions, id defaults`() {
        val raw = "[TAPPY_ASK]{\"questions\":[" +
            "{\"q\":\"A?\",\"options\":[\" x \",\"y\",\"z\",\"w\",\"v\"]}," +
            "{\"q\":\"B?\",\"options\":[\"only\"]}," +
            "{\"q\":\"C?\",\"options\":[\"1\",\"2\"]},{\"q\":\"D?\",\"options\":[\"1\",\"2\"]},{\"q\":\"E?\",\"options\":[\"1\",\"2\"]}]}[/TAPPY_ASK]"
        val qs = ChatResponseParser.parse(raw).ask
        assertEquals(listOf("A?", "C?", "D?"), qs.map { it.q })
        assertEquals(listOf("x", "y", "z", "w"), qs[0].options)
        assertEquals("q1", qs[0].id)
    }

    @Test fun `the answer joins the chosen options in question order, then the free text`() {
        val qs = ChatResponseParser.parse(uatAsk).ask
        assertEquals("Tuần sau · 5-10 triệu · đi biển", AskBlock.composeAnswer(qs, mapOf("budget" to "5-10 triệu", "departure" to "Tuần sau"), "  đi biển "))
        assertEquals("", AskBlock.composeAnswer(qs, emptyMap(), " "))
    }

    @Test fun `this build declares it renders the ask block (x-tappy-caps, R10)`() {
        val req = com.tappyai.app.chat.data.chatRequest("https://uat.tappyai.com/", okhttp3.RequestBody.create(null, ByteArray(0)))
        assertEquals("ask", req.header(com.tappyai.app.chat.data.CAPS_HEADER))
        assertEquals("android", req.header("x-tappy-surface"))
    }

    @Test fun `bullet-dot question lines render one per line (readable ASK on non-web surfaces)`() {
        val v = markdownVisibleText("Để mình gợi ý lịch trình phù hợp:\n• Bạn muốn khởi hành ngày nào?\n• Đi mấy người?")
        assertEquals("Để mình gợi ý lịch trình phù hợp:\n• Bạn muốn khởi hành ngày nào?\n• Đi mấy người?", v)
    }
}
