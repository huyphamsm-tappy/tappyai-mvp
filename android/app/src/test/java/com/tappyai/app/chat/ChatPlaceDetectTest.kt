package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Test

/** Pins [detectFirstPlaceName] (chat "Save place" pre-fill) against the web `detectFirstPlaceName`. */
class ChatPlaceDetectTest {

    @Test
    fun `internal_booking CTA name param wins`() {
        val buttons = listOf(ChatCtaButton(label = "Đặt bàn", type = "internal_booking", url = "/book?name=Nh%C3%A0+H%C3%A0ng+ABC&id=1", primary = false))
        assertEquals("Nhà Hàng ABC", detectFirstPlaceName("some text", buttons))
    }

    @Test
    fun `falls back to first bold 3-40 chars`() {
        assertEquals("Quán Cơm Tấm", detectFirstPlaceName("Bạn nên thử **Quán Cơm Tấm** nhé", emptyList()))
    }

    @Test
    fun `bold outside 3-40 chars is ignored`() {
        assertEquals("", detectFirstPlaceName("**ab** too short", emptyList()))
        assertEquals("", detectFirstPlaceName("**" + "x".repeat(41) + "**", emptyList()))
    }

    @Test
    fun `no place detected yields empty`() {
        assertEquals("", detectFirstPlaceName("just a plain reply", emptyList()))
    }
}
