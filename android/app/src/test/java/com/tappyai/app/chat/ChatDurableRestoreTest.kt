package com.tappyai.app.chat

import com.tappyai.core.designsystem.component.TappyChatRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * 🚨 A REOPENED CONVERSATION LOST EVERY STRUCTURED CARD — AND IT WAS A SAVE BUG, NOT A RENDER BUG.
 *
 * The server puts the plan, the CTA buttons and the shopping decision INSIDE the assistant text,
 * because that is the only channel that survives a save/reload round trip. Web and iOS both store
 * that raw text and decode it at render, so reopening a chat rebuilds every card.
 *
 * Android did neither half. `persistConversation` saved `ChatMessage.text` — the text AFTER every
 * block had been decoded and stripped out — so the markers were destroyed at save time and the
 * data no longer existed to decode. The restore path then built the message with
 * `text = stored.content` and never ran the parser at all. The result: a reopened conversation
 * showed prose where the user had originally been given a trip plan, order buttons and a shopping
 * decision, and no amount of work in the UI could have brought them back.
 *
 * These tests hold both halves: what gets SAVED still carries the markers, and what gets RESTORED
 * runs through the same parser the live turn ran. The round trip is exercised for real — the
 * assertions below decode the actual persisted string — and the two wiring rules are pinned against
 * the ViewModel source, because a correct round trip helper wired to nothing is still the old bug.
 */
class ChatDurableRestoreTest {

    /** A production-shaped reply: prose, an inline photo, and two structured blocks. */
    private val rawReply = """
        Mình gợi ý **Quán Bún Bò Huế Đông Ba** nhé, quán mở từ sáng sớm.

        ![Ảnh địa điểm](https://cdn.example/dongba.jpg)
        [CTA_BUTTONS]{"buttons":[{"label":"Xem bản đồ","type":"maps","url":"https://maps.example/a","primary":true}]}[/CTA_BUTTONS]
        [FOLLOWUPS]Quán nào gần hơn?|Có chỗ đậu xe không?
    """.trimIndent()

    /** Exactly what `persistConversation` writes for an assistant turn. */
    private fun persisted(msg: ChatMessage): String = msg.raw.ifBlank { msg.text }

    /** Exactly what the restore path rebuilds from a stored assistant row. */
    private fun restored(stored: String): ChatMessage {
        val parsed = ChatResponseParser.parse(stored)
        return ChatMessage(
            id = 1L,
            role = TappyChatRole.Assistant,
            text = parsed.text,
            plan = parsed.plan,
            ctaButtons = parsed.ctaButtons,
            followups = parsed.followups,
            shopping = parsed.shopping,
            places = parsed.places,
            segments = parsed.segments,
            raw = stored,
        )
    }

    /** The live turn, as `sendUserMessage` builds it once the stream completes. */
    private fun live(raw: String): ChatMessage {
        val parsed = ChatResponseParser.parse(raw)
        return ChatMessage(
            id = 0L,
            role = TappyChatRole.Assistant,
            text = parsed.text,
            plan = parsed.plan,
            ctaButtons = parsed.ctaButtons,
            followups = parsed.followups,
            shopping = parsed.shopping,
            places = parsed.places,
            segments = parsed.segments,
            raw = raw,
        )
    }

    @Test
    fun `what is saved still carries the markers the cards are rebuilt from`() {
        val stored = persisted(live(rawReply))
        assertTrue("the saved row must keep the CTA block", stored.contains("[CTA_BUTTONS]"))
        assertTrue("the saved row must keep the followups", stored.contains("[FOLLOWUPS]"))
    }

    @Test
    fun `the visible text of a live turn never contains a raw marker`() {
        val msg = live(rawReply)
        for (marker in listOf("[CTA_BUTTONS]", "[/CTA_BUTTONS]", "[FOLLOWUPS]", "buttons\":")) {
            assertFalse("$marker leaked into the visible text", msg.text.contains(marker))
        }
    }

    @Test
    fun `a restored turn carries the same cards as the live one`() {
        val liveMsg = live(rawReply)
        val restoredMsg = restored(persisted(liveMsg))

        assertEquals("visible text", liveMsg.text, restoredMsg.text)
        assertEquals("CTA buttons", liveMsg.ctaButtons, restoredMsg.ctaButtons)
        assertEquals("followups", liveMsg.followups, restoredMsg.followups)
        assertEquals("segments", liveMsg.segments, restoredMsg.segments)
        assertTrue("the restored turn must carry its buttons", restoredMsg.ctaButtons.isNotEmpty())
        assertEquals("Xem bản đồ", restoredMsg.ctaButtons.first().label)
    }

    @Test
    fun `the visible text of a restored turn never contains a raw marker`() {
        val restoredMsg = restored(persisted(live(rawReply)))
        for (marker in listOf("[CTA_BUTTONS]", "[/CTA_BUTTONS]", "[FOLLOWUPS]", "buttons\":")) {
            assertFalse("$marker leaked into restored text", restoredMsg.text.contains(marker))
        }
        // The photo still renders as a gallery segment rather than as raw markdown in the bubble.
        assertFalse("image markdown leaked into the text", restoredMsg.text.contains("!["))
        assertTrue("the photo must survive as a segment", restoredMsg.segments.any { it is ReplySegment.Images })
    }

    @Test
    fun `a shopping decision survives the round trip`() {
        val withDecision = rawReply + "\n[TAPPY_SHOPPING]" +
            """{"entities":[{"key":"k1","config":"MacBook Air M2 8GB","matchesRequest":"khop","recommended":true,"offers":[]}]}""" +
            "[/TAPPY_SHOPPING]"
        val restoredMsg = restored(persisted(live(withDecision)))
        assertNotNull("the decision must be rebuilt from storage", restoredMsg.shopping)
        assertEquals("MacBook Air M2 8GB", restoredMsg.shopping!!.entities.first().config)
        assertFalse(restoredMsg.text.contains("TAPPY_SHOPPING"))
    }

    // ── The durable PLACE card: the reason the raw content has to survive at all ────────────

    private val placesBlock =
        "[TAPPY_PLACES]{\"v\":1,\"items\":[" +
            "{\"id\":\"place:osm:1\",\"domain\":\"food\",\"kind\":\"place\",\"rank\":0," +
            "\"actions\":[{\"kind\":\"maps\",\"urlKind\":\"direct\",\"url\":\"https://maps.example/a\",\"labelKey\":\"v3.action.maps\"}]," +
            "\"name\":\"Bún Bò Huế Đông Ba\",\"address\":\"110 Nguyễn Du\",\"rating\":4.6,\"ratingCount\":1284}" +
            "]}[/TAPPY_PLACES]"

    @Test
    fun `a durable place card is rebuilt from storage after a reload`() {
        val liveMsg = live(rawReply + "\n" + placesBlock)
        val stored = persisted(liveMsg)
        assertTrue("the saved row must keep the place block", stored.contains("[TAPPY_PLACES]"))

        val restoredMsg = restored(stored)
        assertEquals("the same places, in the same order", liveMsg.places, restoredMsg.places)
        val place = restoredMsg.places.single()
        assertEquals("Bún Bò Huế Đông Ba", place.name)
        assertEquals("110 Nguyễn Du", place.address)
        assertEquals(1284, place.ratingCount)
        assertEquals("https://maps.example/a", place.actions.single().url)
        // And it reaches the card with its content intact.
        assertEquals("Bún Bò Huế Đông Ba", place.toCardView()!!.name)
    }

    @Test
    fun `the place block never appears in the visible text, live or restored`() {
        val liveMsg = live(rawReply + "\n" + placesBlock)
        val restoredMsg = restored(persisted(liveMsg))
        for (fragment in listOf("[TAPPY_PLACES]", "[/TAPPY_PLACES]", "\"items\"", "place:osm", "labelKey")) {
            assertFalse("$fragment leaked live", liveMsg.text.contains(fragment))
            assertFalse("$fragment leaked after restore", restoredMsg.text.contains(fragment))
        }
    }

    @Test
    fun `the LIVE annotation is not persisted, and the durable block is what survives`() {
        // The `8:` annotation is session state: the chat stores {role, content} only, so a
        // reopened turn cannot have it. That is precisely why the durable block exists, and why
        // the card falls back to it rather than to a re-fetch.
        val liveMsg = live(rawReply + "\n" + placesBlock).copy(
            livePlaces = PlacesLiveView(kind = PLACES_ANNOTATION_KIND, items = listOf(LivePlace(id = "p1", name = "Quán Live"))),
        )
        val restoredMsg = restored(persisted(liveMsg))
        assertNull("a restored turn has no live annotation", restoredMsg.livePlaces)
        assertTrue("but it does have the durable card", restoredMsg.places.isNotEmpty())
    }

    @Test
    fun `a user turn stores its own text, having no raw form`() {
        val user = ChatMessage(id = 2L, role = TappyChatRole.User, text = "quán bún bò ngon ở quận 1")
        assertEquals("quán bún bò ngon ở quận 1", persisted(user))
    }

    // ── The wiring. A correct round trip that the ViewModel does not perform is still the bug. ──

    private fun source(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, rel)
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        fail("$rel not found above ${File(".").absolutePath}")
        error("unreachable")
    }

    private val viewModel: String
        get() = source("android/app/src/main/java/com/tappyai/app/chat/ChatViewModel.kt")

    @Test
    fun `persistConversation saves the raw content, not the stripped text`() {
        assertTrue(
            "persistConversation must write ChatMessage.raw — saving `text` destroys every marker",
            viewModel.contains("content = it.raw.ifBlank { it.text }"),
        )
    }

    @Test
    fun `the restore path runs the same parser the live path runs`() {
        assertTrue(
            "restoring a conversation must decode the stored content",
            viewModel.contains("ChatResponseParser.parse(stored.content)"),
        )
    }
}
