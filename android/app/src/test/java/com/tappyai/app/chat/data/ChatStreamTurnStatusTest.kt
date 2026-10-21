package com.tappyai.app.chat.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * C2 P2 (web `readTurnStatus`): the server ends a broken answer with an `8:` annotation of kind
 * `tappy.turn_status.v1` — `incomplete` or `interrupted`. It is a status line, never text: it must
 * not become a `Text` event, and a value this version does not know is ignored.
 */
class ChatStreamTurnStatusTest {

    private fun frame(status: String) =
        """8:[{"kind":"tappy.turn_status.v1","v":1,"status":"$status","reason":"deadline"}]"""

    @Test
    fun `incomplete and interrupted are TurnStatus events`() {
        assertEquals(ChatStreamEvent.TurnStatus(TurnStatusKind.Incomplete), ChatStreamFrames.parse(frame("incomplete")))
        assertEquals(ChatStreamEvent.TurnStatus(TurnStatusKind.Interrupted), ChatStreamFrames.parse(frame("interrupted")))
    }

    @Test
    fun `an unknown status value is ignored, not an error and not text`() {
        assertNull(ChatStreamFrames.parse(frame("refunded")))
        assertNull(ChatStreamFrames.parse("""8:[{"kind":"tappy.turn_status.v1","v":1}]"""))
    }

    @Test
    fun `the SSE data prefix is tolerated like every other frame`() {
        assertEquals(ChatStreamEvent.TurnStatus(TurnStatusKind.Interrupted), ChatStreamFrames.parse("data: " + frame("interrupted")))
    }

    @Test
    fun `a status frame is not a finish or error frame, so a clean end still counts as cut-free`() {
        val end = ChatStreamEnd()
        end.feed("""0:"Xin chào"""")
        end.feed(frame("incomplete"))
        end.feed("""d:{"finishReason":"stop"}""")
        assertEquals(false, end.cut)
    }
}
