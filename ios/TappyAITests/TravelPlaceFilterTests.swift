import XCTest
@testable import TappyAI

/// Android `TravelPlaceFilterTest`: a venue the itinerary already presents is not drawn a second time as a place card.
final class TravelPlaceFilterTests: XCTestCase {

    private func plan(_ items: [(String, String?)]) throws -> TappyPlan {
        let rows = items.map { name, id -> String in
            let pid = id.map { "\"\($0)\"" } ?? "null"
            return "{\"time\":\"9:00\",\"emoji\":\"🏨\",\"category\":\"hotel\",\"name\":\"\(name)\",\"place_id\":\(pid)}"
        }.joined(separator: ",")
        let json = "{\"type\":\"trip\",\"title\":\"Đà Lạt\",\"days\":[{\"label\":\"Ngày 1\",\"items\":[\(rows)]}]}"
        return try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8))
    }

    private func place(_ id: String, _ name: String, rank: Int) -> PlaceCardView { PlaceCardView(id: id, name: name, rank: rank) }

    func testTheSameVenueSpelledTwoWaysIsDropped() throws {
        let p = try plan([("Khách Sạn Đồi Mây Đà Lạt", nil)])
        let places = [place("place:osm:11.9,108.4", "Khách Sạn Đồi Mây Đà Lạt, Da Lat (updated prices 2026)", rank: 0),
                      place("place:osm:11.95,108.45", "Hồ Xuân Hương", rank: 1)]
        let kept = TravelPlaceFilter.placesOutsideItinerary(plan: p, places: places)
        XCTAssertEqual(kept.map(\.name), ["Hồ Xuân Hương"])
        XCTAssertEqual(kept.first?.rank, 1, "ranks are never renumbered")
    }

    func testAMatchingIdIsACertainMatchEvenWithDifferentNames() throws {
        let p = try plan([("Quán A", "abc")])
        XCTAssertEqual(TravelPlaceFilter.placesOutsideItinerary(plan: p, places: [place("abc", "Tên khác hẳn", rank: 0)]).count, 0)
    }

    func testTwoDifferentIdsProveNothing_theNamesDecide() throws {
        let p = try plan([("Cinestar Quốc Thanh", "provider-1")])
        let kept = TravelPlaceFilter.placesOutsideItinerary(plan: p, places: [place("place:osm:1,2", "Cinestar Quốc Thanh", rank: 0)])
        XCTAssertEqual(kept.count, 0)
    }

    func testAReplyWithoutAPlanIsUntouched() {
        let places = [place("a", "Quán A", rank: 0), place("b", "Quán B", rank: 1)]
        XCTAssertEqual(TravelPlaceFilter.placesOutsideItinerary(plan: nil, places: places), places)
    }

    func testShortSingleWordNamesNeverMatch() {
        XCTAssertFalse(TravelPlaceFilter.isSameVenueName("Spa", "Spa Lá Xanh"))
        XCTAssertFalse(TravelPlaceFilter.isSameVenueName("Bún", "Bún chả Hương Liên"))
        XCTAssertTrue(TravelPlaceFilter.isSameVenueName("Cinestar", "Cinestar Quốc Thanh"))
    }

    func testWordsNotSubstrings() {
        XCTAssertFalse(TravelPlaceFilter.isSameVenueName("Spa Lan", "Spadium Lan Hotel"))
        XCTAssertTrue(TravelPlaceFilter.isSameVenueName("Long Bien Hotel", "Long Biên Hotel Hà Nội"))
    }

    func testDiacriticsAndCaseAreFolded() {
        XCTAssertTrue(TravelPlaceFilter.isSameVenueName("HẢI SẢN NHƠN LÝ", "hai san nhon ly"))
    }
}
