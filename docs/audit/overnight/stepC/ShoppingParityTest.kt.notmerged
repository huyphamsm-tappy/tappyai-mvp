package com.tappyai.app.chat

import com.tappyai.app.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Locale

/**
 * Shopping information parity with web (`ShoppingDecision.tsx`, `reasonText.ts`).
 *
 * The five-domain UAT on 2026-09-12 found the phone LOSING information the wire carried: the
 * listing's rating (`offers[].rating/ratingCount`), the data behind each reason (`params`), the
 * user's stated configuration (`requested`, which gates the match badge) and the stated
 * `specs`/`condition`. These tests drive the real marker parser with the real wire shape and pin
 * the pure label mappings the card draws from.
 */
class ShoppingParityTest {

    /** The shape the canonical server wrote for "Tai nghe chống ồn dưới 2 triệu?" (UAT wire). */
    private val WIRE = """
        {"v":1,
         "entities":[
           {"key":"uncertain:0","name":"Tai nghe chống ồn TOTAL TSP701","config":"chip ? · RAM ? · storage ?",
            "specs":[],"condition":null,"matchesRequest":"chua_ro","recommended":true,
            "priceLow":95000,"priceHigh":95000,"image":"https://img.example/tsp701.jpg",
            "offers":[{"seller":"Kết Nối Tiêu Dùng","url":"https://www.google.com/shopping/x","price":95000,"currency":"VND","condition":null,"rating":4.7,"ratingCount":339}]},
           {"key":"macbook:1","name":"MacBook Air M2","config":"M2 · 16GB · 512GB",
            "specs":[{"key":"chip","value":"M2"},{"key":"ram","value":16},{"key":"storage","value":512}],
            "condition":{"key":"likeNew","label":"Like new 99%"},"matchesRequest":"khac","recommended":false,
            "priceLow":24990000,"priceHigh":null,"image":null,
            "offers":[{"seller":"CellphoneS","url":"https://cps.example/1","price":24990000,"currency":"VND","condition":"Like new 99%"}]}
         ],
         "recommendation":{"entityKey":"uncertain:0","seller":"Kết Nối Tiêu Dùng",
           "reasons":[{"attribute":"rating","evidence":"rated 4.7","params":{"value":4.7}},
                      {"attribute":"price","evidence":"95000 VND","params":{"priceVnd":95000}},
                      {"attribute":"reviewCount","evidence":"339 reviews","params":{"count":339}}],
           "tradeOff":{"attribute":"rating","evidence":"rated 4.9","params":{"value":4.9}},
           "conditional":true},
         "requested":null}
    """.trimIndent()

    private fun view(body: String = WIRE): ShoppingDecisionView =
        ChatResponseParser.parse("[TAPPY_SHOPPING]$body[/TAPPY_SHOPPING]\n\nMình tìm giúp bạn nhé.").shopping!!

    // ── A. offer rating ────────────────────────────────────────────────────

    @Test
    fun `A - the listing's rating and review count reach the model and the featured offer`() {
        val v = view()
        val hero = v.entities.first { it.recommended }
        assertEquals(4.7, hero.offers.single().rating!!, 0.0)
        assertEquals(339, hero.offers.single().ratingCount)
        // The featured offer is the seller the recommendation names.
        val featured = featuredOffer(hero, v.recommendation)!!
        assertEquals("Kết Nối Tiêu Dùng", featured.seller)
        assertEquals(4.7, featured.rating!!, 0.0)
        // Without a named seller, the first listing is featured; a listing without a rating has none.
        val alt = v.entities.first { !it.recommended }
        assertNull(featuredOffer(alt, null)!!.rating)
    }

    @Test
    fun `A - numbers print like web's String(value)`() {
        assertEquals("4.7", numberText(4.7))
        assertEquals("5", numberText(5.0))
        assertEquals("1.284", countText(1284.0, Locale("vi", "VN")))
        assertEquals("1,284", countText(1284.0, Locale.US))
    }

    // ── B. localised reasons ───────────────────────────────────────────────

    @Test
    fun `B - a reason with params resolves to the localised sentence, with its data`() {
        val v = view()
        val reasons = v.recommendation!!.reasons
        assertEquals(4.7, reasons[0].number("value")!!, 0.0)
        val vi = Locale("vi", "VN")
        assertEquals(ReasonSpec(R.string.shopping_reason_rating, "4.7", "rated 4.7"), shoppingReasonSpec(reasons[0], vi))
        assertEquals(ReasonSpec(R.string.shopping_reason_price, "95.000₫", "95000 VND"), shoppingReasonSpec(reasons[1], vi))
        assertEquals(ReasonSpec(R.string.shopping_reason_review_count, "339", "339 reviews"), shoppingReasonSpec(reasons[2], vi))
        assertEquals(ReasonSpec(R.string.shopping_reason_rating, "4.9", "rated 4.9"), shoppingReasonSpec(v.recommendation!!.tradeOff!!, vi))
    }

    @Test
    fun `B - without params the engine's own words are kept, never invented`() {
        val bare = ShoppingReason(attribute = "rating", evidence = "rated 4.7")
        assertEquals(ReasonSpec(null, null, "rated 4.7"), shoppingReasonSpec(bare, Locale.US))
        val unknown = ShoppingReason(attribute = "battery", evidence = "pin tốt", params = mapOf("hours" to kotlinx.serialization.json.JsonPrimitive(20)))
        assertEquals(ReasonSpec(null, null, "pin tốt"), shoppingReasonSpec(unknown, Locale.US))
        assertEquals(R.string.shopping_reason_direct_page, shoppingReasonSpec(ShoppingReason("directPage", "direct booking page"), Locale.US).res)
        assertEquals("2.5", shoppingReasonSpec(ShoppingReason("distance", "2.5 km", mapOf("km" to kotlinx.serialization.json.JsonPrimitive(2.5))), Locale.US).arg)
    }

    // ── C. requested gates the match badge ─────────────────────────────────

    @Test
    fun `C - an explicit null request hides the badge, a stated one shows it, an old marker without the key shows it`() {
        assertFalse("requested: null → no badge (web showMatch)", view().showsMatchBadge)
        val stated = view(WIRE.replace("\"requested\":null", "\"requested\":\"M2 · 16GB · 512GB\""))
        assertTrue(stated.showsMatchBadge)
        assertEquals("M2 · 16GB · 512GB", stated.requestedText)
        val old = view(WIRE.replace(Regex(",\\s*\"requested\":null"), ""))
        assertTrue("a marker written before the field existed keeps today's badge", old.showsMatchBadge)
    }

    // ── D. specs and condition are preserved and labelled like web ─────────

    @Test
    fun `D - specs and condition decode and resolve to web's labels`() {
        val alt = view().entities.first { !it.recommended }
        assertEquals(listOf("chip", "ram", "storage"), alt.specs.map { it.key })
        assertEquals(listOf("M2", "16", "512"), alt.specs.map { it.valueText })
        assertEquals(R.string.shopping_spec_chip to "M2", specLabelSpec(alt.specs[0]))
        assertEquals(R.string.shopping_spec_ram to "16", specLabelSpec(alt.specs[1]))
        assertEquals(R.string.shopping_spec_storage to "512", specLabelSpec(alt.specs[2]))
        assertNull("a spec with no value is not a chip", specLabelSpec(ShoppingSpecView(key = "ram", value = null)))
        assertEquals("likeNew", alt.condition!!.key)
        assertEquals(R.string.shopping_condition_like_new, conditionLabelRes(alt.condition!!.key))
        assertNull("an unknown key falls back to the seller's own wording", conditionLabelRes("mystery"))
        // The hero of this wire stated nothing: empty specs, null condition — nothing to draw.
        val hero = view().entities.first { it.recommended }
        assertTrue(hero.specs.isEmpty()); assertNull(hero.condition)
    }

    // ── E. offer link labels and the alternative rows (web OfferRow / AlternativeRow) ──

    @Test
    fun `E - an offer link says what it opens - a Google search, another site's product, or the seller's own page`() {
        val google = offerDestination("https://www.google.com/search?ibp=oshop&q=tai+nghe", "Kết Nối Tiêu Dùng")!!
        assertEquals("Google", google.platform); assertFalse(google.direct)
        assertEquals(R.string.shopping_decision_view_on_search to "Google", offerActionLabelSpec(google))
        val tikiPage = offerDestination("https://tiki.vn/tai-nghe-p123.html", "CellphoneS")!!
        assertTrue(tikiPage.direct); assertFalse(tikiPage.isSeller)
        assertEquals(R.string.shopping_decision_view_on to "Tiki", offerActionLabelSpec(tikiPage))
        val own = offerDestination("https://cellphones.com.vn/tai-nghe.html", "CellphoneS")!!
        assertTrue(own.direct && own.isSeller)
        assertEquals(R.string.shopping_decision_view to null, offerActionLabelSpec(own))
        assertEquals(R.string.shopping_decision_view to null, offerActionLabelSpec(offerDestination(null, "x")))
        assertEquals(R.string.shopping_decision_view_on_search to "Shopee", offerActionLabelSpec(offerDestination("https://shopee.vn/search?keyword=x", null)))
    }

    @Test
    fun `E - the alternative rows carry image, seller, rating, chips and the link, like web`() {
        val src = File(findSrc("app/src/main/java/com/tappyai/app/chat/ShoppingDecisionCard.kt")).readText()
        val alt = src.substring(src.indexOf("private fun AlternativeEntity("), src.indexOf("private fun MatchBadge("))
        assertTrue("thumbnail", alt.contains("entity.image?.let { url ->"))
        assertTrue("seller", alt.contains("offer?.seller?.let { seller ->"))
        assertTrue("rating with its count", alt.contains("text = ratingLine(rating, offer.ratingCount)"))
        assertTrue("spec + condition chips", alt.contains("entity.specs.mapNotNull { specLabel(it) }"))
        assertTrue("a real destination, labelled by what it is", alt.contains("offerActionLabel(offerDestination(url, offer.seller))"))
        assertTrue("badge still gated", alt.contains("if (showMatch) MatchBadge(entity.matchesRequest)"))
        // The hero's offer row uses the same label rule instead of a blanket "Xem".
        assertTrue(src.contains("val viewLabel = offerActionLabel(offerDestination(offer.url, offer.seller))"))
    }

    // ── The card draws exactly these ───────────────────────────────────────

    @Test
    fun `the card gates the badge, prints the offer rating and says reasons through reasonText`() {
        val src = File(findSrc("app/src/main/java/com/tappyai/app/chat/ShoppingDecisionCard.kt")).readText()
        assertTrue(src.contains("if (showMatch) MatchBadge(entity.matchesRequest)"))
        assertTrue(src.contains("showMatch = view.showsMatchBadge"))
        assertTrue(src.contains("featured?.rating?.let { rating ->"))
        assertTrue(src.contains("offer.rating?.let { rating ->"))
        assertTrue(src.contains("text = \"· \${reasonText(r)}\""))
        assertTrue(src.contains("\${reasonText(t)}"))
        assertTrue(src.contains("entity.specs.mapNotNull { specLabel(it) }"))
        assertFalse("no raw evidence reaches the screen any more", src.contains("\${r.evidence}"))
    }

    private fun findSrc(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.path
            dir = dir.parentFile
        }
        error("$rel not found")
    }
}
