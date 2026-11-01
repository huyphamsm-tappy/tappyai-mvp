package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Owner 01/11 (Android = the web). The web's shopping card shows, on every product row, the rating of the offer it features (never the entity's), the
 * stated specs and the seller's condition as chips, the seller's name beside the price, and the offer's own link when no verified merchant handoff exists
 * (components/chat/ShoppingDecision.tsx). Android decoded none of rating / ratingCount / specs / condition and its alternative rows had no seller, no
 * facts and no fallback link, so an alternative with no handoff had no link at all. The server sends these fields (SynthesisView); the phone now reads
 * and shows them, deriving nothing.
 */
class ShoppingFactsTest {
    private fun root() = generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "docs/uat/evidence").isDirectory }
    private val payload = """
        {"v":1,"entities":[{"key":"k0","config":"M2 · 8GB · 256GB","name":"MacBook Air M2","matchesRequest":"khop","recommended":true,
        "priceLow":21000000,"priceHigh":23500000,
        "specs":[{"key":"chip","value":"M2"},{"key":"ram","value":8},{"key":"storage","value":256}],
        "condition":{"key":"genuine","label":"Chính hãng"},
        "offers":[{"seller":"Cellphones","url":"https://cellphones.com.vn/a","price":21000000,"currency":"VND","condition":null,"rating":4.5,"ratingCount":1234},
                  {"seller":"Shopee Mall","url":"https://shopee.vn/b","price":23500000,"currency":"VND","condition":null}]}],
        "recommendation":{"entityKey":"k0","seller":"Shopee Mall","reasons":[],"conditional":false}}
    """.trimIndent()
    private val view by lazy { ChatResponseParser.parse("Đây.[TAPPY_SHOPPING]$payload[/TAPPY_SHOPPING]").shopping!! }

    @Test fun `the rating, the specs and the condition the server sends are decoded`() {
        val e = view.entities.single()
        assertEquals(listOf("chip" to "M2", "ram" to "8", "storage" to "256"), e.specs.map { it.key to it.value })
        assertEquals("genuine", e.condition?.key)
        assertEquals("Chính hãng", e.condition?.label)
        assertEquals(4.5, e.offers[0].rating!!, 0.0)
        assertEquals(1234, e.offers[0].ratingCount)
        assertNull(e.offers[1].rating)
    }

    @Test fun `an older marker without these fields still decodes`() {
        val old = """{"v":1,"entities":[{"key":"k","config":"c","matchesRequest":"chua_ro","recommended":false,"offers":[{"seller":"S","url":"https://x.example","price":1.0}]}]}"""
        val e = ChatResponseParser.parse("x[TAPPY_SHOPPING]$old[/TAPPY_SHOPPING]").shopping!!.entities.single()
        assertTrue(e.specs.isEmpty())
        assertNull(e.condition)
        assertNull(e.offers.single().rating)
    }

    @Test fun `the featured offer is the recommended seller's, else the first`() {
        val e = view.entities.single()
        assertEquals("Shopee Mall", featuredOffer(e, "Shopee Mall")?.seller)
        assertEquals("Cellphones", featuredOffer(e, "Không có")?.seller)
        assertEquals("Cellphones", featuredOffer(e, null)?.seller)
        assertNull(featuredOffer(e.copy(offers = emptyList()), null))
    }

    @Test fun `the rating is the featured listing's own, its count grouped as the reader's language writes it`() {
        assertEquals(RatingFacts("4.5", "1.234"), ratingFacts(4.5, 1234, "vi"))
        assertEquals(RatingFacts("4.5", "1,234"), ratingFacts(4.5, 1234, "en"))
        assertEquals(RatingFacts("4.5", null), ratingFacts(4.5, null, "vi"))
        assertEquals(RatingFacts("4.5", null), ratingFacts(4.5, 0, "vi"))
        assertNull(ratingFacts(null, 12, "vi"))
    }

    @Test fun `the chips are the labelled specs then the condition, nothing stated means nothing shown`() {
        val e = view.entities.single()
        val chips = specChips(e, spec = { k, v -> if (k == "ram") "${v}GB RAM" else if (k == "storage") "${v}GB bộ nhớ" else v }, condition = { k -> if (k == "genuine") "Chính hãng" else null })
        assertEquals(listOf("M2", "8GB RAM", "256GB bộ nhớ", "Chính hãng"), chips)
        // a condition with no dictionary entry is the seller's own wording
        assertEquals(listOf("Hàng trưng bày"), specChips(ShoppingEntityView(condition = ShoppingConditionView(key = null, label = "Hàng trưng bày")), { _, v -> v }, { null }))
        assertTrue(specChips(ShoppingEntityView(), { _, v -> v }, { null }).isEmpty())
    }

    @Test fun `the card shows them, and an alternative with no merchant handoff keeps its offer link`() {
        val card = File(root(), "android/app/src/main/java/com/tappyai/app/chat/ShoppingDecisionCard.kt").readText()
        assertTrue(card.contains("specChips("))
        assertTrue(card.contains("ratingFacts("))
        assertTrue(card.contains("entity.offers.firstOrNull()") || card.contains("featuredOffer("))
        // the alternative row, like the recommended one, falls back to the offer's own link while no detail handoff exists
        val alt = card.substringAfter("private fun AlternativeEntity")
        assertTrue(alt.contains("handoffs.detail.isEmpty()") && alt.contains("OfferRow("))
    }
}
