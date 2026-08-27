package com.tappyai.app.chat

import com.tappyai.app.history.StoredChatMessage
import com.tappyai.core.designsystem.component.TappyChatRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * REGRESSION (permanent): reopening a conversation from Chat history showed the RAW
 * `[TAPPY_SHOPPING]{…}` marker.
 *
 * The live stream has parsed markers since the P0 fix, but the resume path assigned the persisted
 * text straight to [ChatMessage.text]. That text is raw by contract: the web's `ChatInterface`
 * saves `m.content` verbatim and re-parses on every render, so the stored row for ANY shopping turn
 * — including one created on the web today — still carries the marker. Two populations were
 * therefore affected, not just old builds:
 *
 *   1. conversations written by an Android build older than the marker parser, and
 *   2. conversations written by the web at any time, then resumed on Android.
 *
 * [restoredMessages] closes both by running the same parse chain the live stream runs.
 */
class RestoredConversationParsingTest {

    /** A real shopping payload, shaped exactly as the server emits it. */
    private val shoppingMarker =
        """[TAPPY_SHOPPING]{"v":1,"entities":[{"key":"clear","config":"Ốp trong · chống sốc","matchesRequest":"khop","recommended":true,"priceLow":150000,"priceHigh":220000,"image":null,"offers":[{"seller":"Shopee Mall","url":"https://shop/clear","price":150000,"currency":"VND","condition":null}]}],"recommendation":{"entityKey":"clear","seller":"Shopee Mall","reasons":[{"attribute":"gia","evidence":"rẻ nhất trong nhóm"}],"tradeOff":null,"conditional":false}}[/TAPPY_SHOPPING]"""

    private fun assistant(content: String) = StoredChatMessage(role = "assistant", content = content)
    private fun user(content: String) = StoredChatMessage(role = "user", content = content)

    // The exact defect: a persisted shopping turn must not reopen as raw JSON.
    @Test
    fun `a persisted shopping turn resumes as a card, never as raw JSON`() {
        val stored = listOf(
            user("muốn mua ốp lưng cho iphone 17 promax"),
            assistant("Mình chọn ốp trong chống sốc — 150.000đ.\n$shoppingMarker"),
        )

        val restored = restoredMessages(stored, firstId = 0L)

        val reply = restored[1]
        assertTrue("no marker may survive", !reply.text.contains("TAPPY_SHOPPING"))
        assertTrue("no raw JSON may survive", !reply.text.contains("\"entities\""))
        assertEquals("Mình chọn ốp trong chống sốc — 150.000đ.", reply.text)
        assertNotNull("the card must be restored, not just stripped", reply.shopping)
        assertEquals("clear", reply.shopping?.recommendation?.entityKey)
        assertEquals("Shopee Mall", reply.shopping?.entities?.first()?.offers?.first()?.seller)
    }

    // A user's own words are not a reply envelope — they must survive verbatim.
    @Test
    fun `user turns are never parsed`() {
        val typed = "tìm giúp mình [TAPPY_SHOPPING] nghĩa là gì vậy"
        val restored = restoredMessages(listOf(user(typed)), firstId = 0L)

        assertEquals(TappyChatRole.User, restored[0].role)
        assertEquals("the user's text must survive verbatim", typed, restored[0].text)
        assertNull(restored[0].shopping)
    }

    // The other marker blocks were leaking through the same path.
    @Test
    fun `legacy plan and CTA markers are stripped and restored as structure`() {
        val plan = """[TAPPY_PLAN]{"title":"Một ngày ở Đà Nẵng","days":[{"label":"Ngày 1","items":[{"time":"09:00","name":"Cà phê Cộng"}]}]}[/TAPPY_PLAN]"""
        val cta = """[CTA_BUTTONS]{"buttons":[{"label":"Đặt bàn","type":"maps","url":"https://example.com"}]}[/CTA_BUTTONS]"""

        val restored = restoredMessages(listOf(assistant("Lịch trình của bạn đây.\n$plan\n$cta")), firstId = 0L)

        val reply = restored[0]
        assertTrue("no plan marker may survive", !reply.text.contains("TAPPY_PLAN"))
        assertTrue("no CTA marker may survive", !reply.text.contains("CTA_BUTTONS"))
        assertEquals("Lịch trình của bạn đây.", reply.text)
        assertNotNull(reply.plan)
        assertEquals(1, reply.ctaButtons.size)
    }

    // A marker that never decodes must still be stripped — a leak is worse than a missing card.
    @Test
    fun `a malformed marker is stripped even though no card can be built`() {
        val restored = restoredMessages(
            listOf(assistant("Trước.[TAPPY_SHOPPING]{not valid json[/TAPPY_SHOPPING]Sau.")),
            firstId = 0L,
        )

        assertTrue(!restored[0].text.contains("TAPPY_SHOPPING"))
        assertTrue(!restored[0].text.contains("not valid json"))
        assertNull("a malformed payload yields no card", restored[0].shopping)
    }

    // An unclosed marker — how a stream that was cut off would have been persisted.
    @Test
    fun `an unclosed marker is stripped to the end of the text`() {
        val restored = restoredMessages(
            listOf(assistant("""Mình chọn ốp trong.[TAPPY_SHOPPING]{"v":1,"entit""")),
            firstId = 0L,
        )

        assertEquals("Mình chọn ốp trong.", restored[0].text)
        assertTrue(!restored[0].text.contains("["))
    }

    @Test
    fun `an ordinary reply is unchanged`() {
        val prose = "Mình chọn Quán hủ tiếu thả - Dì Ba — 4.6⭐ (57 đánh giá Google Maps)."
        val restored = restoredMessages(listOf(assistant(prose)), firstId = 0L)

        assertEquals(prose, restored[0].text)
        assertNull(restored[0].shopping)
        assertNull(restored[0].plan)
        assertTrue(restored[0].ctaButtons.isEmpty())
    }

    // Ids feed the feedback/persistence index, so they must stay unique and ordered.
    @Test
    fun `ids are sequential from the supplied start and roles are preserved`() {
        val stored = listOf(user("a"), assistant("b"), user("c"), assistant("d"))

        val restored = restoredMessages(stored, firstId = 7L)

        assertEquals(listOf(7L, 8L, 9L, 10L), restored.map { it.id })
        assertEquals(
            listOf(
                TappyChatRole.User,
                TappyChatRole.Assistant,
                TappyChatRole.User,
                TappyChatRole.Assistant,
            ),
            restored.map { it.role },
        )
    }

    @Test
    fun `an empty conversation restores to nothing`() {
        assertTrue(restoredMessages(emptyList(), firstId = 0L).isEmpty())
    }
}
