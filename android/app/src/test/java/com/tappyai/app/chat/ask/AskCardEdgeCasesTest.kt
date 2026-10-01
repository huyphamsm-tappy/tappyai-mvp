package com.tappyai.app.chat.ask

import com.tappyai.app.chat.AskQuestion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Odd asks the server can send (02/10 sweep): a question with no options, a dozen options, a very long title,
 * duplicate labels, emoji-only labels, an English ask, an id nobody has seen. None may throw, lose an option, or
 * make the answer text repeat itself.
 */
class AskCardEdgeCasesTest {

    private fun q(id: String, q: String, vararg o: String) = AskQuestion(id, q, o.toList())

    @Test fun `a question without options still draws and answers`() {
        val views = AskCardModel.viewOf(listOf(q("x", "Bạn muốn gì?")))
        assertEquals(1, views.size)
        assertTrue(views[0].options.isEmpty())
        assertEquals(AskKind.OTHER, views[0].kind)
        assertEquals("Tìm cho tôi", AskCardModel.sendText(views, emptyMap()))
        assertEquals("gần nhà", AskCardModel.sendText(views, emptyMap(), "gần nhà"))
    }

    @Test fun `no questions at all is a MAIN card and an empty view list`() {
        assertEquals(AskArea.MAIN, AskCardModel.areaOf(emptyList()))
        assertTrue(AskCardModel.viewOf(emptyList()).isEmpty())
    }

    @Test fun `twelve options all survive and answer in the card's order`() {
        val labels = (1..12).map { "Lựa chọn $it" }
        val views = AskCardModel.viewOf(listOf(q("dish", "Món gì?", *labels.toTypedArray())))
        assertEquals(labels, views[0].options.map { it.label })
        val chosen = mapOf("dish" to setOf("Lựa chọn 9", "Lựa chọn 2", "Lựa chọn 12"))
        assertEquals("Lựa chọn 2, Lựa chọn 9, Lựa chọn 12", AskCardModel.composeAnswer(views, chosen))
    }

    @Test fun `a very long title is kept whole`() {
        val long = "Bạn đang tìm quán ăn cho cả nhà vào cuối tuần này, có người lớn tuổi và trẻ nhỏ, cần chỗ đậu xe, " .repeat(4)
        val views = AskCardModel.viewOf(listOf(q("dish", long, "Món Việt", "Lẩu")))
        assertEquals(long, views[0].title)
    }

    @Test fun `duplicate labels are chosen together but never repeated in the answer`() {
        val views = AskCardModel.viewOf(listOf(q("dish", "Món gì?", "Phở", "Phở", "Bún")))
        val text = AskCardModel.composeAnswer(views, mapOf("dish" to setOf("Phở")))
        assertEquals("a duplicated label must not print twice", "Phở", text)
    }

    @Test fun `emoji-only and punctuation-only labels are safe`() {
        val views = AskCardModel.viewOf(listOf(q("mood", "Hôm nay thế nào?", "😊", "😔", "...", "—")))
        assertEquals(4, views[0].options.size)
        assertEquals("😊, —", AskCardModel.composeAnswer(views, mapOf("mood" to setOf("—", "😊"))))
    }

    @Test fun `an English ask neither throws nor invents an area from nothing`() {
        val qs = listOf(q("dish", "Which cuisine are you in the mood for?", "Vietnamese", "Japanese", "Not sure"), q("party", "How many people?", "1", "2", "4+"))
        val area = AskCardModel.areaOf(qs)
        assertTrue("some area, no crash: $area", area in AskArea.values())
        assertEquals(2, AskCardModel.viewOf(qs).size)
    }

    @Test fun `an id nobody has seen is an ordinary question and its options keep their order`() {
        val views = AskCardModel.viewOf(listOf(q("zzz_new_id", "Câu hỏi mới?", "B", "A", "C")))
        assertEquals(listOf("B", "A", "C"), views[0].options.map { it.label })
        assertFalse(views[0].kind.multi && views[0].kind == AskKind.PARTY)
    }

    @Test fun `typed text alone and chosen options together join with the middle dot, extra spaces trimmed`() {
        val views = AskCardModel.viewOf(listOf(q("dish", "Món gì?", "Phở", "Bún")))
        assertEquals("Phở · gần quận 1", AskCardModel.sendText(views, mapOf("dish" to setOf("Phở")), "  gần quận 1  "))
    }
}
