package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * One reply, one presentation — for SHOPPING.
 *
 * The server writes its own UI into the prose: on a shopping turn it splices a product photo line
 * and a merchant row ("[Shopee](…) · [Lazada](…) · [Tiki](…)") beside each product it recognises.
 * That is the pre-V3 presentation. When the `[TAPPY_SHOPPING]` block arrives too, the reply
 * carries BOTH, and the screen drew the inline copies underneath the decision card: the same photo
 * twice, the same seller as a raw link and again as an offer row. The card wins, so the inline
 * copies are dropped at parse time ([ChatResponseParser.stripInjectedEnrichment]).
 *
 * 🚨 PLACES ARE THE DELIBERATE EXCEPTION, and the first test pins it. A place turn keeps its
 * inline photo as a gallery segment next to the place card — that is the canonical behaviour
 * (`ChatStreamWireReplayTest`, Pixel_8-verified), and the durable/live place projections are the
 * server's decision that this parser adds no presentation rule on top of. So the SAME enrichment
 * that is stripped beside a shopping card is left alone beside a place card.
 */
class RendererPrecedenceTest {

    private val enrichedProse = """
        Mình tìm giúp bạn nhé! 🎧

        Mình gợi ý cho bạn **Sony WH-1000XM5** — lựa chọn nổi bật nhất. 👍

        ![Ảnh sản phẩm](https://img.example/a.jpg)
        [Shopee](https://shopee.vn/x) · [Lazada](https://lazada.vn/y) · [Tiki](https://tiki.vn/z)

        Ngoài ra bạn cũng có thể thử **Bose QC45** nếu muốn khám phá thêm.

        ![Ảnh sản phẩm](https://img.example/b.jpg)
        [Shopee](https://shopee.vn/p) · [Lazada](https://lazada.vn/q) · [Tiki](https://tiki.vn/r)

        Bạn muốn đặt online hay ghé trực tiếp?
    """.trimIndent()

    /** A decision with NAMED entities — the condition under which the card actually renders. */
    private val shoppingMarker =
        """[TAPPY_SHOPPING]{"v":1,"entities":[""" +
            """{"key":"a","name":"Sony WH-1000XM5","config":"","image":"https://img.example/a.jpg","recommended":true,"offers":[]},""" +
            """{"key":"b","name":"Bose QC45","config":"","image":"https://img.example/b.jpg","offers":[]}],""" +
            """"recommendation":null}[/TAPPY_SHOPPING]"""

    /** The canonical durable block: `{v, items}` of [PersistedPlace]. */
    private val placesMarker =
        """[TAPPY_PLACES]{"v":1,"items":[""" +
            """{"id":"place:osm:1","domain":"food","kind":"place","rank":0,"name":"Quán A","image":"https://img.example/a.jpg"},""" +
            """{"id":"place:osm:2","domain":"food","kind":"place","rank":1,"name":"Quán B","image":"https://img.example/b.jpg"}]}""" +
            """[/TAPPY_PLACES]"""

    // ── The exception, first ────────────────────────────────────────────────────────────────

    @Test
    fun `a places card does NOT suppress the inline gallery — places keep the server's presentation`() {
        val parsed = ChatResponseParser.parse(enrichedProse + placesMarker)

        assertEquals("the durable block decodes", 2, parsed.places.size)
        assertEquals("Quán A", parsed.places.first().name)
        // The gallery stays, next to the card: not this parser's decision to take away.
        assertEquals(2, parsed.segments.filterIsInstance<ReplySegment.Images>().size)
        assertTrue(parsed.streamText.contains("![Ảnh sản phẩm]"))
        assertTrue(parsed.streamText.contains("Shopee"))
        // The marker itself never reaches the user, gallery or not.
        assertFalse(parsed.text.contains("TAPPY_PLACES"))
        assertFalse(parsed.streamText.contains("\"items\""))
    }

    // ── Shopping: the card wins ─────────────────────────────────────────────────────────────

    @Test
    fun `a shopping card suppresses the inline photos and merchant rows`() {
        val parsed = ChatResponseParser.parse(enrichedProse + shoppingMarker)

        assertNotNull(parsed.shopping)
        // The card renders the photos, so no inline gallery is left to draw under it.
        assertTrue(parsed.segments.none { it is ReplySegment.Images })
        assertFalse(parsed.streamText.contains("![Ảnh sản phẩm]"))
        // The offer rows carry the real sellers; the raw duplicates are gone.
        assertFalse(parsed.streamText.contains("Shopee"))
        assertFalse(parsed.streamText.contains("Lazada"))
        assertFalse(parsed.streamText.contains("tiki.vn"))
    }

    @Test
    fun `the assistant's own sentences survive suppression intact`() {
        val parsed = ChatResponseParser.parse(enrichedProse + shoppingMarker)

        assertTrue(parsed.text.contains("Mình tìm giúp bạn nhé!"))
        assertTrue(parsed.text.contains("**Sony WH-1000XM5**"))
        assertTrue(parsed.text.contains("Ngoài ra bạn cũng có thể thử **Bose QC45**"))
        assertTrue(parsed.text.contains("Bạn muốn đặt online hay ghé trực tiếp?"))
        // No run of blank lines left where the removed rows used to be.
        assertFalse(parsed.text.contains("\n\n\n"))
    }

    @Test
    fun `with no structured card the legacy presentation is left exactly as it was`() {
        // The card is what replaces it. Without one, removing the photos and links would delete
        // the only product information the reply has.
        val parsed = ChatResponseParser.parse(enrichedProse)

        assertTrue(parsed.segments.any { it is ReplySegment.Images })
        assertTrue(parsed.streamText.contains("Shopee"))
        assertEquals(2, parsed.segments.filterIsInstance<ReplySegment.Images>().size)
    }

    @Test
    fun `a shopping payload that renders nothing does not take the prose's content away`() {
        // Every entity nameless → the card draws nothing (product-identity rule). Suppressing here
        // would leave the user with neither a card nor the photos.
        val nameless =
            """[TAPPY_SHOPPING]{"v":1,"entities":[{"key":"a","config":"chip ?","offers":[]},""" +
                """{"key":"b","config":"c","name":"   ","offers":[]}]}[/TAPPY_SHOPPING]"""
        val parsed = ChatResponseParser.parse(enrichedProse + nameless)

        assertNotNull("the payload still decodes", parsed.shopping)
        assertTrue(parsed.shopping!!.entities.none { it.displayName != null })
        assertTrue(parsed.segments.any { it is ReplySegment.Images })
        assertTrue(parsed.streamText.contains("Shopee"))
    }

    @Test
    fun `a link inside a sentence is prose and is never removed`() {
        // Only a line that is NOTHING but links is the injected row. A sentence that happens to
        // carry one is the model writing, and must survive.
        val parsed = ChatResponseParser.parse(
            "Bạn xem thêm ở [Shopee](https://shopee.vn/a) nhé.\n\n" +
                "![Ảnh sản phẩm](https://img.example/a.jpg)" + shoppingMarker,
        )

        assertTrue(parsed.text.contains("[Shopee](https://shopee.vn/a)"))
        assertTrue(parsed.segments.none { it is ReplySegment.Images })
    }

    @Test
    fun `suppression leaves no marker or json behind`() {
        val parsed = ChatResponseParser.parse(enrichedProse + shoppingMarker)

        for (name in listOf("TAPPY_PLACES", "TAPPY_SHOPPING", "CTA_BUTTONS", "FOLLOWUPS")) {
            assertFalse(parsed.text.contains(name))
            assertFalse(parsed.streamText.contains(name))
        }
        assertFalse(parsed.text.contains("\"v\":1"))
    }

    @Test
    fun `a mid-stream snapshot without its marker yet keeps the legacy content`() {
        // Streaming safety: until the block has arrived there is no card and the inline content
        // is all the reply has. It must not flicker away and back.
        val partial = ChatResponseParser.parse(enrichedProse)
        val settled = ChatResponseParser.parse(enrichedProse + shoppingMarker)

        assertTrue(partial.segments.any { it is ReplySegment.Images })
        assertTrue(settled.segments.none { it is ReplySegment.Images })
        // Both settle on the same sentences — only the duplicated presentation differs.
        assertTrue(partial.text.contains("**Sony WH-1000XM5**"))
        assertTrue(settled.text.contains("**Sony WH-1000XM5**"))
    }

    @Test
    fun `a reply carrying both decisions strips the enrichment once and keeps both payloads`() {
        // The shopping strip removes whole enrichment lines, and it does not know which product
        // or place a photo line belonged to — so with a shopping card present the inline gallery
        // goes as a whole. The place payload itself is untouched and still yields its cards.
        val parsed = ChatResponseParser.parse(enrichedProse + shoppingMarker + placesMarker)

        assertNotNull(parsed.shopping)
        assertEquals(2, parsed.places.size)
        assertTrue(parsed.segments.none { it is ReplySegment.Images })
        assertFalse(parsed.text.contains("TAPPY_"))
    }
}
