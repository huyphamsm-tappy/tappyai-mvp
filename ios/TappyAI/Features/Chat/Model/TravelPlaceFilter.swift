import Foundation

/// Keeps a travel reply from showing the same venue twice — a port of Android `TravelPlaceFilter.kt`.
///
/// A trip reply can carry BOTH `[TAPPY_PLAN]` (the itinerary) and `[TAPPY_PLACES]` (the ranked places the server matched in the
/// reply, which on a plan turn includes the plan's own venues), so a hotel that is already an itinerary item comes back as a
/// place card. The itinerary is the primary UI for a plan: a place already presented as an itinerary item is dropped from the
/// cards. Anything the decision recommends that the itinerary does NOT contain survives; a reply with no plan is untouched.
///
/// IDENTITY, NOT POSITION: list order is never used (the two markers are ordered independently), and the server's ranks are left
/// exactly as stated — survivors are never renumbered. This is a presentation decision at the render boundary; the marker
/// contract and `PersistedPlace` stay as they arrive.
enum TravelPlaceFilter {

    /// The cards minus every place the itinerary already presents. Unchanged when there is no plan or no itinerary.
    static func placesOutsideItinerary(plan: TappyPlan?, places: [PlaceCardView]) -> [PlaceCardView] {
        guard let plan, !places.isEmpty else { return places }
        let items = plan.days.flatMap { $0.items }
        guard !items.isEmpty else { return places }
        return places.filter { place in
            !items.contains { isSameVenue(itemName: $0.name, itemPlaceId: $0.placeId, placeId: place.id, placeName: place.name) }
        }
    }

    /// Whether an itinerary item and a place card are the same real-world venue. An id decides it only when the two are EQUAL
    /// (the itinerary's `place_id` is a provider id, the decision's `id` the server's recommendation identity — two differing
    /// ids prove nothing, so the names decide).
    static func isSameVenue(itemName: String, itemPlaceId: String?, placeId: String, placeName: String?) -> Bool {
        let itemId = (itemPlaceId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let id = placeId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !itemId.isEmpty, !id.isEmpty, itemId == id { return true }
        return isSameVenueName(itemName, placeName ?? "")
    }

    private static let minSingleWord = 6

    /// Names compared as WORD sequences (not substrings: «Spa» must not match «Spadium»). A single word must be at least six
    /// characters («Cinestar» matches «Cinestar Quốc Thanh»; a bare «Spa» or «Bún» matches nothing): a missed duplicate shows one
    /// venue twice, a false match silently deletes a real recommendation.
    static func isSameVenueName(_ a: String, _ b: String) -> Bool {
        let x = venueWords(a), y = venueWords(b)
        if x.isEmpty || y.isEmpty { return false }
        let (shorter, longer) = x.count <= y.count ? (x, y) : (y, x)
        if shorter.count == 1, shorter[0].count < minSingleWord { return false }
        return containsRun(longer, shorter)
    }

    private static func containsRun(_ haystack: [String], _ needle: [String]) -> Bool {
        guard needle.count <= haystack.count else { return false }
        for start in 0...(haystack.count - needle.count) where needle.indices.allSatisfy({ haystack[start + $0] == needle[$0] }) {
            return true
        }
        return false
    }

    /// A name reduced to comparable words: diacritics folded, case dropped, punctuation split on (mirrors the server's `normalizeVN`).
    private static func venueWords(_ raw: String) -> [String] {
        let folded = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .replacingOccurrences(of: "\u{0111}", with: "d")
            .replacingOccurrences(of: "\u{0110}", with: "d")
            .lowercased()
        return folded.components(separatedBy: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789").inverted)
            .filter { !$0.isEmpty }
    }
}
