import XCTest
@testable import TappyAI

/// The place decision's rules (Android `PlaceCard.kt`): filter chips, fold, action order, action labels.
final class PlaceDecisionTests: XCTestCase {

    private func place(_ name: String, rank: Int, open: Bool? = nil, rating: Double? = nil,
                       flags: [String] = [], actions: [PersistedPlaceAction] = []) -> PlaceCardView {
        PlaceCardView(id: name, name: name, rank: rank, rating: rating, openNow: open, actions: actions, flags: flags)
    }

    private func action(_ kind: String, url: String = "https://example.com/x", urlKind: String = "direct",
                        platform: String? = nil, attributed: Bool? = nil, primary: Bool? = nil) -> PersistedPlaceAction {
        var a = PersistedPlaceAction(kind: kind, urlKind: urlKind, url: url, labelKey: "", platform: platform, attributed: attributed, commerce: nil)
        if let primary { var c = LiveCommerceFacts(); c.primary = primary; a.commerce = c }
        return a
    }

    // MARK: Filters

    func testAChipIsOfferedOnlyWhenItSplitsTheResult() {
        let items = [place("a", rank: 0, open: true, rating: 4.8, flags: ["wifi"]),
                     place("b", rank: 1, open: false, rating: 4.0, flags: ["wifi"]),
                     place("c", rank: 2, open: true, rating: 4.6, flags: [])]
        XCTAssertEqual(placeFilters(items), [.all, .open, .rated, .wifi],
                       "wifi splits 2/3; open 2/3; rated 2/3; outdoor/vegetarian match nobody")
    }

    func testAChipEveryRowPassesIsNotBuilt() {
        let items = [place("a", rank: 0, open: true), place("b", rank: 1, open: true)]
        XCTAssertEqual(placeFilters(items), [.all])
    }

    func testRatedMeansFourPointFiveOrMore() {
        XCTAssertTrue(PlaceFilterId.rated.matches(place("a", rank: 0, rating: 4.5)))
        XCTAssertFalse(PlaceFilterId.rated.matches(place("a", rank: 0, rating: 4.4)))
        XCTAssertFalse(PlaceFilterId.rated.matches(place("a", rank: 0, rating: nil)))
    }

    func testChipsKeepServerOrder() {
        let items = (0..<5).map { place("p\($0)", rank: $0, open: $0 % 2 == 0) }
        XCTAssertEqual(carouselPlaces(items, filter: .open).map(\.name), ["p0", "p2", "p4"])
    }

    func testFilterRowShowsForChipsOrForMoreThanThreeRows() {
        let two = [place("a", rank: 0), place("b", rank: 1)]
        XCTAssertFalse(showsPlaceFilterRow(two, filters: placeFilters(two)))
        let four = (0..<4).map { place("p\($0)", rank: $0) }
        XCTAssertTrue(showsPlaceFilterRow(four, filters: placeFilters(four)), "the count answers «is this all of them?»")
    }

    // MARK: Fold

    func testFoldShowsTheFirstNAndCountsTheRest() {
        let items = (0..<7).map { place("p\($0)", rank: $0) }
        let folded = foldedPlaces(items, shown: 3, expanded: false, filter: .all)
        XCTAssertEqual(folded.pages.map(\.name), ["p0", "p1", "p2"])
        XCTAssertEqual(folded.hidden, 4)
        let open = foldedPlaces(items, shown: 3, expanded: true, filter: .all)
        XCTAssertEqual(open.pages.count, 7)
        XCTAssertEqual(open.hidden, 0)
    }

    func testAChipIgnoresTheFold() {
        let items = (0..<7).map { place("p\($0)", rank: $0, open: $0 < 5) }
        XCTAssertEqual(foldedPlaces(items, shown: 3, expanded: false, filter: .open).pages.count, 5)
    }

    func testNoShownMeansEveryCard() {
        let items = (0..<7).map { place("p\($0)", rank: $0) }
        XCTAssertEqual(foldedPlaces(items, shown: nil, expanded: false, filter: .all).pages.count, 7)
    }

    // MARK: Order of the model's picks

    func testPicksComeFirstThenTheEnginesOrder() throws {
        let json = #"{"kind":"tappy.places.v1","items":[{"id":"a","name":"A"},{"id":"b","name":"B"},{"id":"c","name":"C"}],"picked":["c","a","zzz"],"shown":3,"mapsSearchUrl":"https://maps.example/q"}"#
        let view = try ResponseDecoder.json.decode(PlacesLiveView.self, from: Data(json.utf8))
        XCTAssertEqual(view.renderOrder().map(\.id), ["c", "a", "b"], "unknown ids are dropped, items never mutated")
        XCTAssertEqual(view.items.map(\.id), ["a", "b", "c"])
        XCTAssertEqual(view.shown, 3)
        XCTAssertEqual(view.mapsSearchUrl, "https://maps.example/q")
    }

    func testAnOlderPayloadHasNoPicksAndNoFold() throws {
        let json = #"{"kind":"tappy.places.v1","items":[{"id":"a","name":"A"}]}"#
        let view = try ResponseDecoder.json.decode(PlacesLiveView.self, from: Data(json.utf8))
        XCTAssertEqual(view.picked, [])
        XCTAssertNil(view.shown)
        XCTAssertEqual(view.renderOrder().map(\.id), ["a"])
    }

    func testFlagsReachTheCardView() throws {
        let json = #"{"kind":"tappy.places.v1","items":[{"id":"a","name":"A","flags":["wifi","vegetarian"]}]}"#
        let view = try ResponseDecoder.json.decode(PlacesLiveView.self, from: Data(json.utf8))
        XCTAssertEqual(view.items[0].toCardView().flags, ["wifi", "vegetarian"])
    }

    // MARK: Actions

    func testActionOrderIsLeadBooksMapsOthers() {
        let list = [action("website"), action("maps"), action("order"), action("review", urlKind: "search"),
                    action("purchase", primary: true), action("call", url: "tel:+84900000000")]
        let grouped = groupPlaceActions(list)
        XCTAssertEqual(grouped.ordered.map(\.kind), ["purchase", "order", "maps", "website", "review", "call"])
    }

    func testAnActionWithoutAUrlIsNotAButton() {
        XCTAssertEqual(groupPlaceActions([action("maps", url: ""), action("website")]).ordered.map(\.kind), ["website"])
    }

    func testTheFourDecisionActionsOnAPlainPlace() {
        let list = [action("maps", url: "https://maps.google.com/?q=x"), action("website", url: "https://quan.vn"),
                    action("review", url: "https://www.google.com/search?q=x+review", urlKind: "search"),
                    action("call", url: "tel:+84900000000")]
        XCTAssertEqual(groupPlaceActions(list).ordered.map(\.kind), ["maps", "website", "review", "call"])
    }

    // MARK: Labels (Android `actionLabelSpec`)

    func testReviewLabels() {
        let search = action("review", url: "https://www.google.com/search?q=x", urlKind: "search")
        XCTAssertEqual(placeActionSpec(search), PlaceActionSpec(key: "place.action.reviewSearchOn", platform: "Google"))
        let attributed = action("review", url: "https://www.tiktok.com/@x", platform: "TikTok", attributed: true)
        XCTAssertEqual(placeActionSpec(attributed), PlaceActionSpec(key: "place.action.reviewOn", platform: "TikTok"))
        let bare = action("review", url: "tel:123", urlKind: "search")
        XCTAssertEqual(placeActionSpec(bare), PlaceActionSpec(key: "place.action.reviewSearchGeneric", platform: nil), "no host, no merchant")
    }

    func testSearchAndPlainLabels() {
        XCTAssertEqual(placeActionSpec(action("booking", url: "https://www.booking.com/s", urlKind: "search")),
                       PlaceActionSpec(key: "place.action.bookingSearch", platform: "Booking.com"))
        XCTAssertEqual(placeActionSpec(action("ticket", url: "https://vexere.com/s", urlKind: "search")),
                       PlaceActionSpec(key: "place.action.ticketSearch", platform: "Vexere"))
        XCTAssertEqual(placeActionSpec(action("maps")), PlaceActionSpec(key: "place.action.maps", platform: nil))
        XCTAssertEqual(placeActionSpec(action("call", url: "tel:1")), PlaceActionSpec(key: "place.action.call", platform: nil))
        XCTAssertEqual(placeActionSpec(action("mystery")), PlaceActionSpec(key: "place.action.website", platform: nil), "an unknown kind reads as a website")
    }

    func testPlatformFromHost() {
        XCTAssertEqual(placePlatform(of: action("website", url: "https://www.quanngon.vn/menu")), "Quanngon")
        XCTAssertEqual(placePlatform(of: action("website", url: "https://shopeefood.vn/x")), "ShopeeFood")
        XCTAssertEqual(placePlatform(of: action("website", url: "https://x.com", platform: "Mine")), "Mine", "the action's own platform wins")
        XCTAssertNil(placePlatform(of: action("call", url: "tel:+84900000000")))
    }

    func testEveryLabelKeyHasACatalogEntry() {
        let keys = ["place.filter.all", "place.filter.open", "place.filter.rated", "place.flag.wifi", "place.flag.outdoor",
                    "place.flag.vegetarian", "place.showMore", "place.showLess", "place.exploreMap", "place.exploreMap.hint",
                    "place.action.reviewOn", "place.action.reviewSearchOn", "place.action.reviewSearchGeneric",
                    "place.action.maps", "place.action.website", "place.action.call", "place.action.bookingSearch",
                    "place.action.ticketSearch", "place.action.searchOn", "place.action.searchGeneric"]
        for key in keys { XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key) }
    }
}
