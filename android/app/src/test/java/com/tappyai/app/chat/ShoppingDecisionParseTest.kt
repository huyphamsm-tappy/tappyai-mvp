package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * D1 (P4-06) — the shopping DECISION now reaches the Android UI instead of being discarded.
 *
 * Before this, `[TAPPY_SHOPPING]` was stripped and thrown away: a mobile user on a shopping turn
 * read the prose and silently lost the recommendation, the price ranges, the match verdicts and
 * every alternative. Web had rendered the decision since Phase 9.
 *
 * The two halves are tested separately on purpose. "It does not leak" was already true and is
 * covered by ChatResponseParserMarkerLeakTest; what was missing is "it decodes". A test that only
 * asserted the block was gone would have passed for the entire time the bug existed.
 */
class ShoppingDecisionParseTest {

    /** The wire shape: the server serialises its own SynthesisView straight into the marker. */
    private val VIEW_JSON = """
        {"v":1,
         "entities":[
           {"key":"e1","config":"MacBook Air M1 8GB/256GB","matchesRequest":"khop","recommended":true,
            "priceLow":18990000,"priceHigh":20490000,"image":"https://img.example/a.jpg",
            "offers":[{"seller":"CellphoneS","url":"https://cps.example/1","price":18990000,"currency":"VND","condition":"Mới"},
                      {"seller":"FPT Shop","url":null,"price":null,"currency":null,"condition":null}]},
           {"key":"e2","config":"MacBook Air M2 8GB/256GB","matchesRequest":"khac","recommended":false,
            "priceLow":24990000,"priceHigh":null,"image":null,"offers":[]}
         ],
         "recommendation":{"entityKey":"e1","seller":"CellphoneS",
           "reasons":[{"attribute":"gia","evidence":"Rẻ hơn 6 triệu so với M2"}],
           "tradeOff":{"attribute":"hieu_nang","evidence":"Chip M1 chậm hơn M2"},
           "conditional":false}}
    """.trimIndent()

    private fun reply(body: String = VIEW_JSON) =
        "[TAPPY_SHOPPING]$body[/TAPPY_SHOPPING]\n\nMình nghiêng về **MacBook Air M1** nhé."

    @Test
    fun `the decision decodes into its model`() {
        val parsed = ChatResponseParser.parse(reply())
        val view = parsed.shopping
        assertNotNull("D1: the decision must reach the UI, not be discarded", view)
        assertEquals(2, view!!.entities.size)

        val recommended = view.entities.first { it.recommended }
        assertEquals("MacBook Air M1 8GB/256GB", recommended.config)
        assertEquals(ShoppingMatch.EXACT, recommended.matchesRequest)
        assertEquals(18990000.0, recommended.priceLow!!, 0.0)
        assertEquals(20490000.0, recommended.priceHigh!!, 0.0)
        assertEquals(2, recommended.offers.size)

        assertEquals("e1", view.recommendation!!.entityKey)
        assertEquals("Rẻ hơn 6 triệu so với M2", view.recommendation!!.reasons.single().evidence)
        assertEquals("Chip M1 chậm hơn M2", view.recommendation!!.tradeOff!!.evidence)
    }

    @Test
    fun `the prose survives and the block never reaches the text`() {
        val parsed = ChatResponseParser.parse(reply())
        assertTrue("prose must survive", parsed.text.contains("MacBook Air M1"))
        // The payload, not merely the tag — an earlier bug removed the tag and left the JSON.
        assertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse(parsed.text.contains("\"entities\""))
        assertFalse(parsed.text.contains("CellphoneS"))
        assertFalse(parsed.text.contains("18990000"))
    }

    @Test
    fun `an unknown value stays unknown rather than becoming a number`() {
        val parsed = ChatResponseParser.parse(reply())
        val alt = parsed.shopping!!.entities.first { !it.recommended }
        assertNull("a missing high bound must stay null, never defaulted", alt.priceHigh)

        val offerWithoutPrice = parsed.shopping!!.entities.first { it.recommended }.offers[1]
        assertNull(offerWithoutPrice.price)
        assertNull(offerWithoutPrice.url)
        assertEquals("FPT Shop", offerWithoutPrice.seller)
    }

    @Test
    fun `a malformed decision decodes to null and still does not leak`() {
        // Decode and strip are independent: a block we cannot understand is still a block the user
        // must not read.
        val parsed = ChatResponseParser.parse(reply("{not valid json"))
        assertNull(parsed.shopping)
        assertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse(parsed.text.contains("not valid json"))
        assertTrue(parsed.text.contains("MacBook Air M1"))
    }

    @Test
    fun `an empty entity list decodes to null — there is no decision to show`() {
        val parsed = ChatResponseParser.parse(reply("""{"v":1,"entities":[],"recommendation":null}"""))
        assertNull("an empty decision is not a decision", parsed.shopping)
    }

    @Test
    fun `a truncated block decodes to null and leaks nothing`() {
        val parsed = ChatResponseParser.parse("[TAPPY_SHOPPING]{\"v\":1,\"entities\":[{\"config\":\"Air")
        assertNull(parsed.shopping)
        assertFalse(parsed.text.contains("TAPPY_SHOPPING"))
        assertFalse(parsed.text.contains("Air"))
    }

    @Test
    fun `a turn with no shopping block carries no decision`() {
        val parsed = ChatResponseParser.parse("Quán này ngon lắm, bạn thử nhé!")
        assertNull(parsed.shopping)
    }

    // ── The honesty rule, at the one place it is easiest to break ────────────

    @Test
    fun `price range renders both bounds, a single bound, or an explicit unknown`() {
        // Web `formatVndShort`: one ROUNDED decimal of a million, comma for Vietnamese.
        val vi = java.util.Locale("vi", "VN")
        assertEquals("19 triệu – 20,5 triệu", priceRangeText(18_990_000.0, 20_490_000.0, "chưa rõ", vi))
        assertEquals("25 triệu", priceRangeText(24_990_000.0, null, "chưa rõ", vi))
        assertEquals("25 triệu", priceRangeText(null, 24_990_000.0, "chưa rõ", vi))
        // Neither bound known: say so. Never "0đ", never an empty string.
        assertEquals("chưa rõ", priceRangeText(null, null, "chưa rõ", vi))
    }

    @Test
    fun `a single-point price is not rendered as a fake range`() {
        assertEquals("19 triệu", priceRangeText(18_990_000.0, 18_990_000.0, "chưa rõ", java.util.Locale("vi", "VN")))
    }

    @Test
    fun `prices print exactly as web formatVndShort does, in both languages`() {
        val vi = java.util.Locale("vi", "VN")
        assertEquals("169.000₫", formatVndShort(169_000.0, vi))
        assertEquals("169,000₫", formatVndShort(169_000.0, java.util.Locale.US))
        assertEquals("1,3 triệu", formatVndShort(1_300_000.0, vi))
        assertEquals("1.3M", formatVndShort(1_300_000.0, java.util.Locale.US))
        assertEquals("1,1 triệu", formatVndShort(1_099_000.0, vi))
        assertEquals("595.209₫", formatVndShort(595_209.0, vi))
    }
}
