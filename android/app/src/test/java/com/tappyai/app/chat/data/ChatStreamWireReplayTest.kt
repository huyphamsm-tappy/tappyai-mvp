package com.tappyai.app.chat.data

import com.tappyai.app.chat.ChatResponseParser
import com.tappyai.app.chat.PLACES_ANNOTATION_KIND
import com.tappyai.app.chat.PlacesLiveView
import com.tappyai.app.chat.ReplySegment
import com.tappyai.app.chat.toCardView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A whole recorded turn, replayed through the client the way the socket delivers it.
 *
 * 🚨 THE UNIT TESTS AROUND THIS ONE ALL START IN THE MIDDLE. They hand [ChatResponseParser] a
 * finished string, which is the shape the parser sees only AFTER the frame reader has done its job
 * — and the frame reader is what was broken: Android recognised `0:` and discarded everything else,
 * so the turn's place decision, sent on `8:`, never existed as far as the phone was concerned. A
 * test that starts from assembled text cannot see that class of bug at all.
 *
 * So this one starts at the wire. Every line in [ChatWireTranscript] was produced by the server's
 * own `buildPlacesLiveView` and `renderPlacesMarker`, and they are replayed through
 * [ChatStreamFrames.parse] → [ChatResponseParser.parse] → the card projection — the same three
 * steps, in the same order, that a real reply takes.
 *
 * It is also the transcript the Pixel_8 verification ran: the emulator drove these exact lines
 * through the real UI, so what this file asserts and what was seen on the device are the same turn.
 */
class ChatStreamWireReplayTest {

    /** What the ViewModel does with the stream: text accumulates, the annotation is held aside. */
    private class Replay(lines: List<String>) {
        val prose = StringBuilder()
        var live: PlacesLiveView? = null

        init {
            for (line in lines) {
                when (val event = ChatStreamFrames.parse(line)) {
                    is ChatStreamEvent.Text -> prose.append(event.delta)
                    is ChatStreamEvent.Places -> live = event.view
                    is ChatStreamEvent.Progress -> Unit // shown while streaming, never part of the turn
                    null -> Unit // a frame this client does not read — skipped, never rendered
                }
            }
        }

        val parsed = ChatResponseParser.parse(prose.toString())
    }

    private val liveTurn = Replay(ChatWireTranscript.lines)

    /** The same turn as it comes back from storage: the annotation was never persisted. */
    private val restoredTurn = Replay(ChatWireTranscript.lines.filterNot { it.startsWith("8:") })

    // ── The frame reader ────────────────────────────────────────────────────

    @Test
    fun `the 8 frame is read, and carries the live decision`() {
        val live = liveTurn.live
        assertNotNull("the annotation frame must not be discarded", live)
        assertEquals(PLACES_ANNOTATION_KIND, live!!.kind)
        assertEquals(2, live.items.size)
        assertEquals("Bún Bò Huế Đông Ba", live.items.first().name)
    }

    @Test
    fun `a frame this client does not read is skipped, not rendered`() {
        // The transcript ends with `d:{"finishReason":"stop"}` — a real part type with no meaning
        // for this client. It must produce no event and, above all, no text.
        assertNull(ChatStreamFrames.parse("""d:{"finishReason":"stop"}"""))
        assertFalse(liveTurn.parsed.text.contains("finishReason"))
    }

    // ── What the user reads ─────────────────────────────────────────────────

    @Test
    fun `the prose survives whole, and no marker or payload reaches it`() {
        val text = liveTurn.parsed.text
        assertTrue(text.contains("Mình gợi ý hai quán bún bò ở Quận 1 nhé."))
        assertTrue(text.contains("Bún Bò Huế Đông Ba"))
        // The source URL stays IN the prose — linkifying happens at render, and stripping it here
        // would remove the only route to the page the answer is citing.
        assertTrue(
            "a bare source URL must survive the parse chain",
            text.contains("https://vnexpress.net/quan-bun-bo-hue-ngon-quan-1-4712345.html"),
        )
        for (fragment in listOf(
            "[TAPPY_PLACES]", "[/TAPPY_PLACES]", "[CTA_BUTTONS]", "[FOLLOWUPS]",
            "\"items\"", "labelKey", "urlKind", "place:osm", "tappy.places",
        )) {
            assertFalse("$fragment reached the user", text.contains(fragment))
        }
        // `text` is also what copy, share and TTS read, so this is the same guarantee for them.
        assertFalse("image markdown belongs in a gallery, not the bubble", text.contains("!["))
    }

    @Test
    fun `the rest of the turn decodes too — photo, CTA behind the marker, follow-ups`() {
        assertTrue(liveTurn.parsed.segments.any { it is ReplySegment.Images })
        assertEquals("Xem bản đồ", liveTurn.parsed.ctaButtons.single().label)
        assertEquals(listOf("Quán nào gần hơn?", "Có chỗ đậu xe không?"), liveTurn.parsed.followups)
    }

    // ── The two projections, and the difference between them ────────────────

    @Test
    fun `the LIVE card carries everything the annotation stated`() {
        val card = liveTurn.live!!.items.first().toCardView()
        assertEquals("Bún Bò Huế Đông Ba", card.name)
        assertEquals("110 Nguyễn Du, Bến Nghé, Quận 1", card.address)
        assertEquals(4.6, card.rating!!, 0.001)
        assertEquals(1284, card.ratingCount)
        assertEquals("Mo-Su 06:00-22:00", card.openingHours)
        assertEquals(1, card.priceLevel)
        assertEquals(1.4, card.distanceKm!!, 0.001)
        assertEquals(listOf("vietnamese", "noodle"), card.categories)
        // Amenities the provider stated. Web renders these as chips; Android decoded them and
        // then dropped them on the way to the card, so "có Wi-Fi" reached the browser only.
        assertEquals(listOf("wifi", "outdoorSeating", "vegetarian"), card.flags)
        assertTrue(card.actions.isNotEmpty())
    }

    @Test
    fun `the DURABLE card is rebuilt from the text alone, with no annotation in sight`() {
        assertNull("a restored turn has no live annotation", restoredTurn.live)
        val places = restoredTurn.parsed.places
        assertEquals(2, places.size)

        val card = places.first().toCardView()!!
        assertEquals("Bún Bò Huế Đông Ba", card.name)
        assertEquals("110 Nguyễn Du, Bến Nghé, Quận 1", card.address)
        assertEquals(4.6, card.rating!!, 0.001)
        assertEquals("Mo-Su 06:00-22:00", card.openingHours)
        assertEquals(1.4, card.distanceKm!!, 0.001)
        assertTrue(card.actions.isNotEmpty())
        // Categories are a LIVE-only field: the annotation carries them, the stored payload does
        // not. This is the visible, intended difference between the two cards — and the reason the
        // durable one must never be "completed" by re-fetching.
        assertTrue(card.categories.isEmpty())
    }

    @Test
    fun `the durable block is present in both turns — it rides in the text, which is what persists`() {
        assertEquals(liveTurn.parsed.places, restoredTurn.parsed.places)
        assertEquals(liveTurn.parsed.text, restoredTurn.parsed.text)
    }

    // ── The sparse place: absent is absent ──────────────────────────────────

    @Test
    fun `a place the source barely knew renders a name and its actions, and nothing invented`() {
        val sparse = restoredTurn.parsed.places[1]
        assertEquals("Quán Vỉa Hè Cô Ba", sparse.name)
        assertNull(sparse.address)
        assertNull(sparse.openingHours)
        assertNull(sparse.rating)
        assertNull(sparse.image)

        val card = sparse.toCardView()!!
        assertNull(card.address)
        assertNull(card.openingHours)
        assertTrue("it still has somewhere to go", card.actions.isNotEmpty())
    }

    @Test
    fun `the unknown sentinel never appears anywhere in the turn`() {
        // The server used to persist "KHONG CO DU LIEU" as if it were an address. Nothing the user
        // can read — prose, durable payload or live payload — may contain it.
        val everything = buildString {
            append(liveTurn.parsed.text)
            append(liveTurn.parsed.places.joinToString { "${it.name}|${it.address}|${it.openingHours}" })
            append(liveTurn.live!!.items.joinToString { "${it.name}|${it.address}|${it.openingHours}" })
        }
        assertFalse(everything.contains("KHONG CO DU LIEU"))
    }
}
