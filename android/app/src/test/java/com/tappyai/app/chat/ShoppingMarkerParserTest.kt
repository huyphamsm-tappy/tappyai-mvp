package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * P0 REGRESSION (permanent): production shipped a build where a Shopping question rendered the raw
 * server marker to the user —
 *
 *     [TAPPY_SHOPPING]{"v":1,"entities":[{"key":"uncertain:0","config":"chip ? · RAM ? …
 *
 * Web parsed `[TAPPY_SHOPPING]` and iOS parsed it on its parity branch; Android had no parser at
 * all, so the marker fell through to the markdown renderer as literal text. The leak became visible
 * the moment the server started emitting the marker for bare purchase intents ("muốn mua ốp lưng").
 *
 * These tests pin the parser contract: the marker is ALWAYS consumed (even when malformed, even
 * when only half-streamed), the decision is decoded when valid, and unknown values stay unknown
 * instead of being invented.
 */
class ShoppingMarkerParserTest {

    /** A realistic payload, shaped exactly like the server's `SynthesisView`. */
    private val marker = """
        [TAPPY_SHOPPING]{"v":1,"entities":[{"key":"m1","config":"M1 · 32GB · 512GB","matchesRequest":"khop","recommended":true,"priceLow":25800000,"priceHigh":27500000,"image":"https://cdn/x.jpg","offers":[{"seller":"Zin100","url":"https://shop/zin","price":25800000,"currency":"VND","condition":null},{"seller":"Tín Phát","url":"https://shop/tin","price":27500000,"currency":"VND","condition":null}]},{"key":"m1pro","config":"M1 Pro · 16GB · 512GB","matchesRequest":"khac","recommended":false,"priceLow":24999000,"priceHigh":24999000,"image":null,"offers":[{"seller":"Lâm Phong","url":"https://shop/lam","price":24999000,"currency":"VND","condition":null}]}],"recommendation":{"entityKey":"m1","seller":"Zin100","reasons":[{"attribute":"rating","evidence":"đánh giá 4.7/5"}],"tradeOff":{"attribute":"gia","evidence":"Tín Phát rẻ hơn"},"conditional":false}}[/TAPPY_SHOPPING]
    """.trimIndent()

    // TEST 1 — a valid marker is parsed.
    @Test
    fun `valid marker is parsed into a decision`() {
        val parsed = ChatResponseParser.parse("Mình gợi ý cấu hình này.\n\n$marker")
        val d = parsed.shopping
        assertNotNull("marker must decode", d)
        assertEquals(2, d!!.entities.size)
    }

    // TEST 2 — the marker never reaches visible prose. THE P0.
    @Test
    fun `marker is removed from visible assistant text`() {
        val parsed = ChatResponseParser.parse("Mình gợi ý cấu hình này.\n\n$marker")
        assertFalse("raw marker leaked", parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse("raw JSON leaked", parsed.text.contains("priceLow"))
        assertFalse("stream text leaked the marker", parsed.streamText.contains("TAPPY_SHOPPING"))
        assertEquals("Mình gợi ý cấu hình này.", parsed.text)
    }

    // TEST 3 — product/config name survives.
    @Test
    fun `product config name survives`() {
        val d = ChatResponseParser.parse(marker).shopping!!
        assertEquals("M1 · 32GB · 512GB", d.entities[0].config)
        assertEquals("M1 Pro · 16GB · 512GB", d.entities[1].config)
    }

    // TEST 4 — price survives, as the provider's number.
    @Test
    fun `price range and offer price survive`() {
        val d = ChatResponseParser.parse(marker).shopping!!
        assertEquals(25800000.0, d.entities[0].priceLow!!, 0.0)
        assertEquals(27500000.0, d.entities[0].priceHigh!!, 0.0)
        assertEquals(25800000.0, d.entities[0].offers[0].price!!, 0.0)
        assertEquals("VND", d.entities[0].offers[0].currency)
    }

    // TEST 5 — seller/condition evidence survives (the shopping analogue of rating/review count;
    // the server's shopping payload carries seller + condition, not a star rating).
    @Test
    fun `seller survives and an unstated condition stays null`() {
        val d = ChatResponseParser.parse(marker).shopping!!
        assertEquals(listOf("Zin100", "Tín Phát"), d.entities[0].offers.map { it.seller })
        assertNull("condition was null on the wire", d.entities[0].offers[0].condition)
    }

    // TEST 6 — the direct product URL survives.
    @Test
    fun `direct product url survives`() {
        val d = ChatResponseParser.parse(marker).shopping!!
        assertEquals("https://shop/zin", d.entities[0].offers[0].url)
        assertEquals("https://shop/lam", d.entities[1].offers[0].url)
    }

    // TEST 7 — the pick/recommendation survives, with its reason and trade-off.
    @Test
    fun `recommendation pick reason and tradeoff survive`() {
        val d = ChatResponseParser.parse(marker).shopping!!
        val rec = d.recommendation!!
        assertEquals("m1", rec.entityKey)
        assertEquals("Zin100", rec.seller)
        assertEquals("đánh giá 4.7/5", rec.reasons[0].evidence)
        assertEquals("Tín Phát rẻ hơn", rec.tradeOff!!.evidence)
        assertEquals(false, rec.conditional)
        assertEquals(true, d.entities.first { it.key == "m1" }.recommended)
    }

    // TEST 8 — unknown stays unknown. Never a fabricated 0 or "".
    @Test
    fun `unknown evidence does not become fabricated data`() {
        val bare = """
            [TAPPY_SHOPPING]{"v":1,"entities":[{"key":"u","config":"M2 · RAM ? · storage ?","matchesRequest":"chua_ro","recommended":true,"priceLow":null,"priceHigh":null,"image":null,"offers":[{"seller":null,"url":null,"price":null,"currency":null,"condition":null}]}],"recommendation":null}[/TAPPY_SHOPPING]
        """.trimIndent()
        val d = ChatResponseParser.parse(bare).shopping!!
        val e = d.entities[0]
        assertNull("priceLow must stay unknown, not 0", e.priceLow)
        assertNull("priceHigh must stay unknown, not 0", e.priceHigh)
        assertNull("image must stay unknown, not empty string", e.image)
        val o = e.offers[0]
        assertNull(o.seller); assertNull(o.url); assertNull(o.price); assertNull(o.currency)
        assertNull("no recommendation was made", d.recommendation)
    }

    // TEST 9 — malformed marker must never crash, and must never dump raw JSON.
    @Test
    fun `malformed marker does not crash and does not leak`() {
        val bad = "Trước.[TAPPY_SHOPPING]{not valid json at all[/TAPPY_SHOPPING]Sau."
        val parsed = ChatResponseParser.parse(bad)
        assertNull("a malformed payload yields no card", parsed.shopping)
        assertFalse("marker leaked", parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse("garbage leaked", parsed.text.contains("not valid json"))
        assertTrue(parsed.text.contains("Trước."))
        assertTrue(parsed.text.contains("Sau."))
    }

    @Test
    fun `empty entities yields no card but still strips the marker`() {
        val empty = """x [TAPPY_SHOPPING]{"v":1,"entities":[],"recommendation":null}[/TAPPY_SHOPPING]"""
        val parsed = ChatResponseParser.parse(empty)
        assertNull(parsed.shopping)
        assertFalse(parsed.text.contains("TAPPY_SHOPPING"))
    }

    // TEST 10 — ordinary replies are untouched.
    @Test
    fun `ordinary assistant text is unchanged`() {
        val plain = "Quán phở này ngon lắm, bạn nên thử nhé!"
        val parsed = ChatResponseParser.parse(plain)
        assertNull(parsed.shopping)
        assertEquals(plain, parsed.text)
    }

    // TEST 11 — the streaming case. ChatViewModel re-parses the WHOLE accumulated buffer on every
    // token, so mid-stream snapshots contain a half-arrived marker. None of those snapshots may
    // show raw JSON, and the final snapshot must decode.
    @Test
    fun `marker split across stream chunks never leaks and resolves at the end`() {
        val full = "Mình chọn cấu hình này.\n\n$marker"
        // Every prefix is a snapshot the UI would render mid-stream.
        val checkpoints = listOf(30, 60, 120, 240, 400, full.length / 2, full.length - 40)
            .filter { it in 1..full.length }
        for (cut in checkpoints) {
            val snapshot = full.substring(0, cut)
            val parsed = ChatResponseParser.parse(snapshot)
            assertFalse(
                "raw marker visible in mid-stream snapshot at $cut chars",
                parsed.streamText.contains("TAPPY_SHOPPING"),
            )
            assertFalse(
                "raw JSON visible in mid-stream snapshot at $cut chars",
                parsed.streamText.contains("\"entities\""),
            )
        }
        // The complete buffer decodes.
        val done = ChatResponseParser.parse(full)
        assertNotNull(done.shopping)
        assertEquals(2, done.shopping!!.entities.size)
        assertEquals("Mình chọn cấu hình này.", done.text)
    }

    // TEST 12 — two markers in one reply must not produce two cards.
    @Test
    fun `repeated markers do not duplicate the card`() {
        val parsed = ChatResponseParser.parse("$marker\n\ngiữa chừng\n\n$marker")
        assertNotNull(parsed.shopping)
        // One decision object, not a merged or doubled one.
        assertEquals(2, parsed.shopping!!.entities.size)
        assertFalse("no marker text may survive", parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse("no raw JSON may survive", parsed.text.contains("priceLow"))
    }

    // Regression guard for the documented Android-only regex hazard: a literal ']' or '}' left
    // unescaped throws PatternSyntaxException on the device's regex engine while passing on the
    // JVM. Touching the parser object forces <clinit>, which is where that crash occurred.
    @Test
    fun `parser class initialises without a regex syntax error`() {
        assertEquals("ok", ChatResponseParser.parse("ok").text)
    }

    // The other markers must keep working alongside the new one.
    @Test
    fun `shopping marker coexists with followups and cta`() {
        val reply = "Chốt nhé.\n\n$marker\n\n[FOLLOWUPS]rẻ hơn|hàng chính hãng|nơi khác[/FOLLOWUPS]"
        val parsed = ChatResponseParser.parse(reply)
        assertNotNull(parsed.shopping)
        assertEquals(listOf("rẻ hơn", "hàng chính hãng", "nơi khác"), parsed.followups)
        assertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse(parsed.text.contains("FOLLOWUPS"))
        assertEquals("Chốt nhé.", parsed.text)
    }
}
