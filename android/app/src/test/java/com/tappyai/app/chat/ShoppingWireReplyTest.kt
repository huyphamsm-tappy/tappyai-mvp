package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The parser and the card, against a REAL reply captured off the wire.
 *
 * `shopping_reply_wire.txt` is the exact assistant text — every `0:` frame of one `/api/chat`
 * response, concatenated the way [com.tappyai.app.chat.data.RealChatRepository] concatenates them —
 * from a live consultative shopping turn. Nothing in it was written by hand, so it carries the
 * shapes a fixture never thinks of: the marker arriving EARLY (right after the opening sentence,
 * because the server ships the decision as soon as the tool result lands, not at the end), prose
 * and image markdown continuing after the closing tag, and real Vietnamese seller names and URLs.
 *
 * It exists because the card did not appear on the device while the same query, replayed against
 * the same server, carried a full decision — so "the parser handles the real bytes" had to stop
 * being an assumption.
 *
 * Decodes into the canonical [ShoppingDecisionView]; the captured match vocabulary is the server's
 * own (`chua_ro`), so the fixture and [ShoppingMatch] cannot drift apart silently.
 */
class ShoppingWireReplyTest {

    private val wire: String =
        checkNotNull(javaClass.classLoader?.getResourceAsStream("shopping_reply_wire.txt")) {
            "shopping_reply_wire.txt missing from test resources"
        }.bufferedReader().use { it.readText() }

    @Test
    fun `the captured reply still contains the marker it was captured for`() {
        // Guards the fixture itself: if this ever fails the file was re-captured from a turn that
        // made no decision, and every assertion below would pass vacuously.
        assertTrue(wire.contains("[TAPPY_SHOPPING]"))
        assertTrue(wire.contains("[/TAPPY_SHOPPING]"))
    }

    @Test
    fun `parsing the real reply yields a decision and leaves no marker in the text`() {
        val parsed = ChatResponseParser.parse(wire)

        assertNotNull("the real payload must parse into a decision", parsed.shopping)
        assertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse(parsed.streamText.contains("TAPPY_SHOPPING"))
        // The prose on both sides of the marker survives — the block sits mid-reply, so a strip
        // that ran to the end of the string would silently swallow the rest of the answer.
        assertTrue(parsed.text.contains("Mình tìm tai nghe chống ồn dưới 5 triệu"))
        assertTrue(parsed.text.contains("Tuy nhiên"))
    }

    @Test
    fun `every entity in the real payload carries a product name the card may show`() {
        val entities = ChatResponseParser.parse(wire).shopping!!.entities

        assertTrue(entities.isNotEmpty())
        for (entity in entities) {
            assertNotNull("entity ${entity.key} has no displayName", entity.displayName)
            // The two fields that must never become a title.
            assertTrue(entity.key.startsWith("uncertain:") || entity.key.isNotBlank())
            assertFalse(entity.displayName == entity.config)
            assertFalse(entity.displayName == entity.key)
        }
    }

    @Test
    fun `the real payload carries the identity fields the card renders`() {
        val view = ChatResponseParser.parse(wire).shopping!!
        val hero = view.entities.firstOrNull { it.key == view.recommendation?.entityKey }
            ?: view.entities.first { it.recommended }

        assertNotNull(hero.displayName)
        // The canonical view carries no rating/review count (the server does not project them);
        // the card is name + match verdict + price + offers, and each of those must be real.
        assertEquals(ShoppingMatch.UNKNOWN, hero.matchesRequest)
        assertTrue("a price must be stateable", hero.priceLow != null || hero.offers.any { it.price != null })
        assertTrue("the action button needs a real destination", hero.offers.any { !it.url.isNullOrBlank() })
        assertTrue("the seller line needs a real merchant", hero.offers.any { !it.seller.isNullOrBlank() })
    }

    @Test
    fun `the recommendation states why and what it costs`() {
        val rec = ChatResponseParser.parse(wire).shopping!!.recommendation

        assertNotNull(rec)
        assertTrue("reasons drive the 'why this one' block", rec!!.reasons.isNotEmpty())
        for (reason in rec.reasons) {
            assertTrue(reason.evidence.isNotBlank() || reason.attribute.isNotBlank())
        }
    }

    @Test
    fun `the card takes over the product images the prose had inline`() {
        // This reply carries `![…](…)` lines around the marker — the server's own inline
        // presentation of the same products the decision card renders.
        //
        // It used to assert the opposite: that those lines still became an inline gallery. They
        // did, UNDER the card, which is the duplication the owner reported from Pixel_8 — one
        // product shown twice, once as a loose photo and once inside the card that knows its name,
        // price and seller. Renderer precedence now gives the card the images, so the assertion
        // flipped with the behaviour. See RendererPrecedenceTest.
        val parsed = ChatResponseParser.parse(wire)

        assertNotNull(parsed.shopping)
        assertTrue("the card renders, so no loose gallery is left", parsed.segments.none { it is ReplySegment.Images })
        assertFalse("images belong to the card, not the clean text", parsed.text.contains("!["))
        // The reasoning around them is untouched — only the duplicated presentation went.
        assertTrue(parsed.text.contains("Mình tìm tai nghe chống ồn dưới 5 triệu"))
        assertTrue(parsed.text.contains("Tuy nhiên"))
    }

    @Test
    fun `a truncated capture of the same reply still hides the decision`() {
        // The same bytes, cut where a dropped connection would cut them: mid-payload.
        val cut = wire.substring(0, wire.indexOf("[TAPPY_SHOPPING]") + 400)
        val parsed = ChatResponseParser.parse(cut)

        assertEquals(null, parsed.shopping)
        assertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        assertTrue(parsed.text.contains("Mình tìm tai nghe chống ồn dưới 5 triệu"))
    }
}
