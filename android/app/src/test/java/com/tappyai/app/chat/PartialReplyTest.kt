package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.TappyChatRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Stop, or a stream that breaks half-way, keeps what has arrived (web `useChat`). The pure part:
 * what the kept message looks like, and when there is nothing to keep.
 */
class PartialReplyTest {

    @Test
    fun `half an answer is kept as the assistant reply with its raw text for storage`() {
        val kept = partialAssistantMessage(7, "Đà Lạt mùa này mát, bạn nên", null)!!

        assertEquals(7L, kept.id)
        assertEquals(TappyChatRole.Assistant, kept.role)
        assertEquals("Đà Lạt mùa này mát, bạn nên", kept.text)
        assertEquals("Đà Lạt mùa này mát, bạn nên", kept.raw)
        assertFalse(kept.isError)
    }

    @Test
    fun `a block cut off at the end never reaches the kept text, the prose before it stays`() {
        val kept = partialAssistantMessage(1, "Kế hoạch đây.[TAPPY_PLAN]{\"title\":\"Đà Lạt\",\"days\":[{\"lab", null)!!

        assertEquals("Kế hoạch đây.", kept.text)
        assertNull(kept.plan)
        assertFalse(kept.text.contains("TAPPY_PLAN"))
    }

    @Test
    fun `nothing readable means nothing is kept`() {
        assertNull(partialAssistantMessage(1, "", null))
        assertNull(partialAssistantMessage(1, "   \n", null))
        // Only a block that is still arriving: no text, no card.
        assertNull(partialAssistantMessage(1, "[TAPPY_SHOPPING]{\"v\":1,\"entities\":[", null))
    }

    @Test
    fun `a closed block with a decodable card is a reply even without prose`() {
        val kept = partialAssistantMessage(
            1,
            """[TAPPY_SHOPPING]{"v":1,"entities":[{"key":"k","name":"Sony WH-1000XM5"}]}[/TAPPY_SHOPPING]""",
            null,
        )
        assertNotNull(kept)
        assertTrue(kept!!.shopping != null)
    }

    @Test
    fun `a streamed repeat is collapsed the same way as for a finished reply`() {
        val once = "Bạn thử quán Bún Bò Huế ở đường Nguyễn Trãi nhé, nước dùng đậm đà và rất đông khách vào buổi sáng."
        val kept = partialAssistantMessage(1, once + "\n\n" + once, null)!!

        assertEquals(once, kept.text)
    }
}
