package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * P4-06 — the comparison Android renders is DERIVED from the decision the reply already carried.
 *
 * These are the same rules web's `comparisonFromSynthesis.test.ts` pins, asserted here so the two
 * platforms cannot drift on the part that matters: what the client is allowed to conclude on its
 * own. The answer is nothing.
 */
class ShoppingComparisonTest {

    private val labels = ComparisonLabels(
        price = "Giá",
        match = "Khớp yêu cầu",
        sellers = "Nơi bán",
        unknown = "chưa rõ",
        matchExact = "Đúng cấu hình",
        matchDifferent = "Khác cấu hình",
        matchUnknown = "Chưa rõ cấu hình",
        sellerCount = { n -> "$n nơi bán" },
        priceRange = { low, high -> priceRangeText(low, high, "chưa rõ") },
    )

    private fun entity(
        key: String = "e1",
        config: String = "Air M1",
        match: String = ShoppingMatch.EXACT,
        recommended: Boolean = false,
        low: Double? = 18_990_000.0,
        high: Double? = 20_490_000.0,
        offers: List<ShoppingOfferView> = emptyList(),
    ) = ShoppingEntityView(key, config, match, recommended, low, high, null, offers)

    private fun view(
        entities: List<ShoppingEntityView>,
        recommendation: ShoppingRecommendationView? = null,
    ) = ShoppingDecisionView(1, entities, recommendation)

    @Test
    fun `not offered below two entities`() {
        assertNull(shoppingComparisonFrom(view(listOf(entity())), labels))
        assertNull(shoppingComparisonFrom(view(emptyList()), labels))
        assertNull(shoppingComparisonFrom(null, labels))
    }

    @Test
    fun `caps at four entities`() {
        val five = (1..5).map { entity(key = "e$it") }
        assertEquals(4, shoppingComparisonFrom(view(five), labels)!!.entities.size)
    }

    @Test
    fun `restates only fields the server supplied`() {
        val c = shoppingComparisonFrom(view(listOf(entity(key = "a"), entity(key = "b"))), labels)!!
        assertEquals(listOf("price", "match", "sellers"), c.attributes.map { it.key })
        for (forbidden in listOf("cheapest", "best", "score", "rank", "value")) {
            assertTrue(
                "the client must form no opinion the server did not state",
                c.attributes.none { it.key == forbidden },
            )
        }
    }

    @Test
    fun `an entity with no offers is unknown, not zero sellers`() {
        val c = shoppingComparisonFrom(view(listOf(entity(key = "a"), entity(key = "b"))), labels)!!
        assertNull(c.entities[0].values["sellers"])
    }

    @Test
    fun `a recommendation is marked only when a reason accompanies it`() {
        val entities = listOf(entity(key = "a", recommended = true), entity(key = "b"))

        val withReason = shoppingComparisonFrom(
            view(entities, ShoppingRecommendationView("a", null, listOf(ShoppingReason("gia", "Rẻ hơn 6 triệu")))),
            labels,
        )!!
        assertEquals("a", withReason.recommendedKey)
        assertEquals("Rẻ hơn 6 triệu", withReason.reason)

        val withoutReason = shoppingComparisonFrom(
            view(entities, ShoppingRecommendationView("a", null, emptyList())),
            labels,
        )!!
        assertNull("DD-005: a recommendation without a reason is not shipped", withoutReason.recommendedKey)
        assertNull(withoutReason.reason)
    }

    @Test
    fun `a recommendation pointing at another entity is ignored`() {
        val c = shoppingComparisonFrom(
            view(
                listOf(entity(key = "a", recommended = true), entity(key = "b")),
                ShoppingRecommendationView("b", null, listOf(ShoppingReason("x", "unrelated"))),
            ),
            labels,
        )!!
        assertNull(c.recommendedKey)
    }

    // ── Row partitioning ────────────────────────────────────────────────────

    @Test
    fun `an attribute nobody has a value for is dropped entirely`() {
        val entities = listOf(
            ComparisonEntity("a", "A", mapOf("price" to "1", "wifi" to null)),
            ComparisonEntity("b", "B", mapOf("price" to "2", "wifi" to null)),
        )
        val attrs = listOf(ComparisonAttribute("price", "Giá"), ComparisonAttribute("wifi", "Wifi"))
        val (differing, identical) = partitionComparisonAttributes(entities, attrs)
        assertTrue((differing + identical).none { it.key == "wifi" })
    }

    @Test
    fun `rows identical for every entity are folded away from the differing set`() {
        val entities = listOf(
            ComparisonEntity("a", "A", mapOf("price" to "100k", "book" to "Có")),
            ComparisonEntity("b", "B", mapOf("price" to "200k", "book" to "Có")),
        )
        val attrs = listOf(ComparisonAttribute("price", "Giá"), ComparisonAttribute("book", "Đặt bàn"))
        val (differing, identical) = partitionComparisonAttributes(entities, attrs)
        assertEquals(listOf("price"), differing.map { it.key })
        assertEquals(listOf("book"), identical.map { it.key })
    }

    @Test
    fun `a partially unknown attribute counts as differing, never as the same for all`() {
        val entities = listOf(
            ComparisonEntity("a", "A", mapOf("book" to "Có")),
            ComparisonEntity("b", "B", mapOf("book" to null)),
        )
        val attrs = listOf(ComparisonAttribute("book", "Đặt bàn"))
        val (differing, identical) = partitionComparisonAttributes(entities, attrs)
        assertEquals(listOf("book"), differing.map { it.key })
        assertTrue("calling it the same for all would be a claim the data does not support", identical.isEmpty())
    }
}
