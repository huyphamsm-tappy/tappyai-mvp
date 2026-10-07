package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A trip reply must not show the same venue twice.
 *
 * The pairing under test is the one the local backend actually produced: `[TAPPY_PLAN]` and
 * `[TAPPY_PLACES]` both carrying the Đà Lạt hotels, because the places decision is built from the
 * reply text and a plan turn's text contains the plan JSON. The itinerary wins; the cards keep only
 * what the itinerary does not already present.
 *
 * The filter runs over the canonical projections — the DURABLE [PersistedPlace] list from the
 * `[TAPPY_PLACES]` v1 `items` block and the LIVE [LivePlace] list from the `8:` annotation — and
 * never alters a place: survivors are the same objects, in the same order, with the same rank.
 */
class TravelPlaceFilterTest {

    private fun item(name: String, placeId: String? = null) =
        PlanItem(time = "09:00", emoji = "📍", category = "food", name = name, placeId = placeId)

    private fun plan(vararg items: PlanItem) =
        TappyPlan(title = "Đà Lạt 1 ngày", days = listOf(PlanDay(label = "Ngày 1", items = items.toList())))

    private fun place(name: String, rank: Int, id: String = "") =
        PersistedPlace(id = id, name = name, rank = rank)

    private fun places(vararg cards: PersistedPlace) = cards.toList()

    private fun names(places: List<PersistedPlace>) = places.map { it.name }

    @Test
    fun `plan A B C with places A B D leaves only D`() {
        val filtered = placesOutsideItinerary(
            plan(item("Quán A"), item("Quán B"), item("Quán C")),
            places(place("Quán A", 1), place("Quán B", 2), place("Quán D", 3)),
        )

        assertEquals(listOf("Quán D"), names(filtered))
    }

    @Test
    fun `a card the itinerary never mentions survives untouched`() {
        val filtered = placesOutsideItinerary(
            plan(item("Nhà hàng Món Ngon Đà Lạt")),
            places(place("Nhà hàng Món Ngon Đà Lạt", 1), place("Thác Datanla", 2)),
        )

        assertEquals(listOf("Thác Datanla"), names(filtered))
        // The surviving card keeps the rank the server gave it — the survivors are not renumbered.
        assertEquals(2, filtered.first().rank)
    }

    @Test
    fun `every place already in the itinerary means no cards at all`() {
        val filtered = placesOutsideItinerary(
            plan(item("Quán A"), item("Quán B")),
            places(place("Quán A", 1), place("Quán B", 2)),
        )

        assertTrue(filtered.isEmpty())
    }

    @Test
    fun `a reply with no plan keeps its places exactly as they arrived`() {
        // Food, spa and entertainment: the cards are the only place UI, nothing to deduplicate
        // against. Same instance back, so nothing is copied or reordered on the common path.
        val list = places(place("Quán A", 1), place("Quán B", 2))
        assertSame(list, placesOutsideItinerary(null, list))
    }

    @Test
    fun `a reply with no places has nothing to show`() {
        assertTrue(placesOutsideItinerary(plan(item("Quán A")), emptyList()).isEmpty())
    }

    @Test
    fun `the search-result title of an itinerary venue is still the same venue`() {
        // Measured live: the itinerary says the hotel name, the places payload carries booking.com's
        // page title for it. An equality test would have kept this duplicate.
        val filtered = placesOutsideItinerary(
            plan(item("Khách Sạn Đồi Mây Đà Lạt")),
            places(place("Khách Sạn Đồi Mây Đà Lạt, Da Lat (updated prices 2026)", 1)),
        )

        assertTrue(filtered.isEmpty())
    }

    @Test
    fun `diacritics spelled differently still match`() {
        // The reply and the tool routinely disagree on diacritics for one venue.
        val filtered = placesOutsideItinerary(
            plan(item("Cà Phê Sỏi Đá")),
            places(place("Ca Phe Soi Da", 1)),
        )

        assertTrue(filtered.isEmpty())
    }

    @Test
    fun `an equal id is a certain match, whatever the names say`() {
        assertTrue(
            placesOutsideItinerary(
                plan(item("Quán A", placeId = "place:osm:10.77430,106.70090")),
                places(place("Hoàn toàn khác tên", 1, id = "place:osm:10.77430,106.70090")),
            ).isEmpty(),
        )
    }

    @Test
    fun `differing ids prove nothing — the names decide`() {
        // The itinerary's `place_id` is a provider id while the decision's `id` is the server's
        // recommendation identity (`place:osm:lat,lng`): one venue routinely carries two ids from
        // two namespaces. So two different ids must NOT keep a duplicate that the names identify…
        assertTrue(
            placesOutsideItinerary(
                plan(item("Highlands Coffee", placeId = "ChIJ_google")),
                places(place("Highlands Coffee", 1, id = "place:osm:10.7,106.7")),
            ).isEmpty(),
        )
        // …and two different ids with two different names are, as ever, two venues.
        val kept = placesOutsideItinerary(
            plan(item("Highlands Coffee", placeId = "ChIJ_google")),
            places(place("Phúc Long Coffee", 1, id = "place:osm:10.8,106.6")),
        )
        assertEquals(listOf("Phúc Long Coffee"), names(kept))
    }

    @Test
    fun `a short generic word never deletes a real recommendation`() {
        // "Spa" must not swallow "Spa Hương Sen": losing a genuine recommendation is a worse
        // failure than showing one venue twice.
        val filtered = placesOutsideItinerary(
            plan(item("Spa")),
            places(place("Spa Hương Sen", 1)),
        )

        assertEquals(listOf("Spa Hương Sen"), names(filtered))
    }

    @Test
    fun `a distinctive single word does match a longer name`() {
        assertTrue(
            placesOutsideItinerary(
                plan(item("Cinestar")),
                places(place("Cinestar Quốc Thanh", 1)),
            ).isEmpty(),
        )
    }

    @Test
    fun `an empty itinerary changes nothing`() {
        val list = places(place("Quán A", 1))
        assertSame(list, placesOutsideItinerary(TappyPlan(title = "trống"), list))
    }

    @Test
    fun `a blank or absent name on either side never matches`() {
        assertEquals(
            listOf("Quán A"),
            names(placesOutsideItinerary(plan(item("   ")), places(place("Quán A", 1)))),
        )
        // A durable place the server could not name (Google-sourced, `mayPersist` dropped it) has
        // nothing to compare; it survives here and the card projection decides what to draw.
        val unnamed = PersistedPlace(id = "place:google:x", name = null, rank = 1)
        assertSame(unnamed, placesOutsideItinerary(plan(item("Quán A")), listOf(unnamed)).single())
    }

    @Test
    fun `the live projection is filtered by the same rule`() {
        // The `8:` annotation carries the same decision in its richer shape; a plan turn must
        // not show a live card for a venue the itinerary already presents either.
        val live = listOf(
            LivePlace(id = "place:osm:1", name = "Quán A", rank = 0),
            LivePlace(id = "place:osm:2", name = "Quán D", rank = 1),
        )
        val filtered = livePlacesOutsideItinerary(plan(item("Quán A")), live)

        assertEquals(listOf("Quán D"), filtered.map { it.name })
        assertSame("survivors are the same objects, not copies", live[1], filtered.single())
        assertSame(live, livePlacesOutsideItinerary(null, live))
    }
}
