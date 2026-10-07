package com.tappyai.app.chat

import java.text.Normalizer

/**
 * Keeps a travel reply from showing the same venue twice.
 *
 * A trip reply can carry BOTH markers for the same venues: `[TAPPY_PLAN]` (the itinerary) and
 * `[TAPPY_PLACES]` (the ranked places the server matched in the reply) — and, while the turn is
 * live, the `8:` annotation carries the same places again in their richer projection. The server
 * builds the places decision from the names the reply text contains, and on a plan turn that text
 * INCLUDES the plan JSON — so the hotel that is already an itinerary item comes back a second time
 * as a place card. Two renderings of one entity, one conversation.
 *
 * The itinerary is the primary UI for a plan, so a place already presented as an itinerary item is
 * dropped from the cards. Anything the decision recommends that the itinerary does NOT contain
 * survives: this filters duplicates, it does not suppress the decision. A reply with no plan is
 * untouched.
 *
 * Done here, at the render boundary, and not in the marker contract: the payload is correct as
 * emitted (every place in it really is in the reply), the `[TAPPY_PLACES]` v1 `items` schema and
 * [PersistedPlace] are the server's and stay exactly as they arrive, and both markers must keep
 * reaching the client so the detectors keep reading exactly what ships. This is a presentation
 * decision, so it belongs on the presentation side — and it applies to BOTH projections of the
 * same decision (live and durable), because the card is one card.
 *
 * IDENTITY, NOT POSITION. List order is never used: the two markers are ordered independently
 * (the plan by time of day, the places by rank), so position carries no relationship between them.
 * The server's ranks are left exactly as stated; survivors are never renumbered.
 */

/** The DURABLE places minus every place the itinerary already presents. Unchanged when there is no plan. */
fun placesOutsideItinerary(plan: TappyPlan?, places: List<PersistedPlace>): List<PersistedPlace> =
    outsideItinerary(plan, places, { it.id }, { it.name })

/** The LIVE places minus every place the itinerary already presents. Unchanged when there is no plan. */
fun livePlacesOutsideItinerary(plan: TappyPlan?, places: List<LivePlace>): List<LivePlace> =
    outsideItinerary(plan, places, { it.id }, { it.name })

private inline fun <T> outsideItinerary(
    plan: TappyPlan?,
    places: List<T>,
    id: (T) -> String,
    name: (T) -> String?,
): List<T> {
    if (plan == null || places.isEmpty()) return places
    val itinerary = plan.days.flatMap { it.items }
    if (itinerary.isEmpty()) return places
    return places.filterNot { place -> itinerary.any { item -> isSameVenue(item, id(place), name(place)) } }
}

/**
 * Whether an itinerary item and a place card are the same real-world venue.
 *
 * An id decides it only when the two are EQUAL. The itinerary's `place_id` is a provider id while
 * the decision's `id` is the server's recommendation identity (`place:osm:lat,lng`), so the two
 * sides routinely carry ids from different namespaces for one venue — two differing ids therefore
 * prove nothing, and the names decide. A matching id is still a certain match.
 */
internal fun isSameVenue(item: PlanItem, placeId: String, placeName: String?): Boolean {
    val itemId = item.placeId?.trim().orEmpty()
    val id = placeId.trim()
    if (itemId.isNotEmpty() && id.isNotEmpty() && itemId == id) return true
    return isSameVenueName(item.name, placeName.orEmpty())
}

/**
 * Name matching, tolerant of the way the two markers spell the same venue.
 *
 * Measured on the local backend: the itinerary said `Khách Sạn Đồi Mây Đà Lạt` while the places
 * marker carried the search-result title `Khách Sạn Đồi Mây Đà Lạt, Da Lat (updated prices 2026)`.
 * One venue, two spellings — so an equality test would have kept the duplicate it exists to remove.
 *
 * Names are compared as WORD sequences, not as substrings: one name matches the other when its
 * words appear consecutively inside it. Comparing raw substrings would make "Spa" match "Spadium".
 *
 * Deliberately conservative on short names. A single word must be at least six characters
 * ("Cinestar" matches "Cinestar Quốc Thanh"; a bare "Spa" or "Bún" matches nothing), because the
 * cost of the two mistakes is not symmetric: a missed duplicate shows one venue twice, while a
 * false match silently deletes a real recommendation the user was meant to see.
 */
internal fun isSameVenueName(a: String, b: String): Boolean {
    val x = venueWords(a)
    val y = venueWords(b)
    if (x.isEmpty() || y.isEmpty()) return false
    val (shorter, longer) = if (x.size <= y.size) x to y else y to x
    if (shorter.size == 1 && shorter[0].length < MIN_SINGLE_WORD) return false
    return containsRun(longer, shorter)
}

/** Whether [needle]'s words appear consecutively inside [haystack]. */
private fun containsRun(haystack: List<String>, needle: List<String>): Boolean {
    if (needle.size > haystack.size) return false
    for (start in 0..haystack.size - needle.size) {
        if (needle.indices.all { haystack[start + it] == needle[it] }) return true
    }
    return false
}

/**
 * A name reduced to comparable words: diacritics folded, case dropped, punctuation split on.
 *
 * Mirrors the server's own `normalizeVN` folding so the two sides compare on the same footing —
 * the reply and the tool routinely disagree on diacritics for the same venue ("Long Bien" vs
 * "Long Biên").
 */
private fun venueWords(raw: String): List<String> =
    Normalizer.normalize(raw.trim(), Normalizer.Form.NFD)
        .replace(COMBINING_MARKS, "")
        .replace('đ', 'd')
        .replace('Đ', 'D')
        .lowercase()
        .split(NON_WORD)
        .filter { it.isNotEmpty() }

private const val MIN_SINGLE_WORD = 6
private val COMBINING_MARKS = Regex("\\p{Mn}+")
private val NON_WORD = Regex("[^a-z0-9]+")
