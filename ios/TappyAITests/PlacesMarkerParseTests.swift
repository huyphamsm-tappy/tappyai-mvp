import XCTest
@testable import TappyAI

/// `[TAPPY_PLACES]` on iOS — the DURABLE place card.
///
/// 🚨 THIS IS THE THIRD MARKER TO ARRIVE SERVER-SIDE, AND THE FIRST TWO BOTH LEAKED. `[CTA_BUTTONS]`
/// rendered its raw JSON as message body on Android, then `[TAPPY_SHOPPING]` did the same here.
/// Both had the same cause: the server added a block, one client learned it, and the others kept
/// reading the text as prose. So the parser is written before the flag that emits the block is
/// turned on, and these tests exist to be green BEFORE a single user can see the marker.
///
/// The shared cases live in `shared/structured-content/marker-fixtures.json` and are executed by
/// `ContentParserFixtureConformanceTests` on all three platforms. This file covers what is specific
/// to the iOS parse chain: that the block cannot break the markers already in it, and that the
/// model carries the rich fields the card renders.
final class PlacesMarkerParseTests: XCTestCase {

    private let prose = "Mình gợi ý mấy quán này nhé."

    private let richItem = """
    {"id":"place:osm:10.77,106.70","domain":"food","kind":"place","rank":0,\
    "actions":[{"kind":"maps","urlKind":"direct","url":"https://maps.example/a","labelKey":"v3.action.maps"},\
    {"kind":"order","urlKind":"search","url":"https://shopeefood.vn/x","labelKey":"v3.action.order","platform":"ShopeeFood"}],\
    "name":"Bún Bò Huế Đông Ba","address":"110 Nguyễn Du, Quận 1","rating":4.6,"ratingCount":1284,\
    "openingHours":"Mo-Su 06:00-22:00","phone":"+84 28 3822 1234","image":"https://cdn.example/a.jpg",\
    "priceLevel":1,"distanceKm":1.4,"reasons":[{"attribute":"rating","evidence":"4.6 sao từ 1284 đánh giá"}]}
    """

    private let sparseItem = """
    {"id":"place:osm:10.78,106.69","domain":"food","kind":"place","rank":1,"actions":[],"name":"Quán Vỉa Hè"}
    """

    private func block(_ items: String...) -> String {
        "[TAPPY_PLACES]{\"v\":1,\"items\":[" + items.joined(separator: ",") + "]}[/TAPPY_PLACES]"
    }

    // MARK: - The payload

    func testAFullPlaceDecodesEveryFieldTheCardRenders() {
        let parsed = ContentParser.parse("\(prose)\n\(block(richItem))")
        XCTAssertEqual(parsed.places.count, 1)
        let p = parsed.places[0]
        XCTAssertEqual(p.name, "Bún Bò Huế Đông Ba")
        XCTAssertEqual(p.address, "110 Nguyễn Du, Quận 1")
        XCTAssertEqual(p.rating, 4.6)
        XCTAssertEqual(p.ratingCount, 1284)
        XCTAssertEqual(p.openingHours, "Mo-Su 06:00-22:00")
        XCTAssertEqual(p.phone, "+84 28 3822 1234")
        XCTAssertEqual(p.image, "https://cdn.example/a.jpg")
        XCTAssertEqual(p.priceLevel, 1)
        XCTAssertEqual(p.distanceKm, 1.4)
        XCTAssertEqual(p.reasons.first?.evidence, "4.6 sao từ 1284 đánh giá")
        XCTAssertEqual(p.actions.count, 2)
        XCTAssertEqual(p.actions[1].platform, "ShopeeFood")
    }

    func testOptionalFieldsTheServerDidNotStateAreAbsentNotBlankOrFabricated() {
        let parsed = ContentParser.parse("\(prose)\n\(block(sparseItem))")
        let p = parsed.places[0]
        XCTAssertEqual(p.name, "Quán Vỉa Hè")
        XCTAssertNil(p.address)
        XCTAssertNil(p.openingHours)
        XCTAssertNil(p.rating)
        XCTAssertNil(p.ratingCount)
        XCTAssertNil(p.priceLevel)
        XCTAssertNil(p.distanceKm)
        XCTAssertNil(p.image)

        // And the card draws nothing for them rather than an empty row.
        let card = p.toCardView()
        XCTAssertNotNil(card)
        XCTAssertNil(card?.address)
        XCTAssertNil(card?.rating)
        XCTAssertEqual(card?.actions.count, 0)
    }

    func testMultiplePlacesKeepTheServersRankOrder() {
        let parsed = ContentParser.parse("\(prose)\n\(block(richItem, sparseItem))")
        XCTAssertEqual(parsed.places.map { $0.name }, ["Bún Bò Huế Đông Ba", "Quán Vỉa Hè"])
        XCTAssertEqual(parsed.places.map(\.rank), [0, 1])
    }

    func testUnknownFieldsAreToleratedOnTheEnvelopeAndOnAnItem() {
        let text = "\(prose)\n[TAPPY_PLACES]{\"v\":1,\"experiment\":\"b\","
            + "\"items\":[{\"id\":\"x\",\"rank\":0,\"actions\":[],\"name\":\"Quán Mới\",\"futureField\":{\"a\":1}}]}[/TAPPY_PLACES]"
        let parsed = ContentParser.parse(text)
        XCTAssertEqual(parsed.places.first?.name, "Quán Mới")
        XCTAssertFalse(parsed.text.contains("futureField"))
    }

    func testAnUnknownVersionStillDecodesBecauseWebDoesNotGateOnItEither() {
        let text = "\(prose)\n[TAPPY_PLACES]{\"v\":99,\"items\":[{\"id\":\"x\",\"rank\":0,\"actions\":[],\"name\":\"Quán Tương Lai\"}]}[/TAPPY_PLACES]"
        XCTAssertEqual(ContentParser.parse(text).places.first?.name, "Quán Tương Lai")
    }

    func testAnEmptyItemsArrayYieldsNoPlacesRatherThanAnEmptyCard() {
        let parsed = ContentParser.parse("\(prose)\n[TAPPY_PLACES]{\"v\":1,\"items\":[]}[/TAPPY_PLACES]")
        XCTAssertTrue(parsed.places.isEmpty)
        XCTAssertEqual(parsed.text, prose)
    }

    // MARK: - Stripping. Decode may fail; the strip may not.

    func testTheBlockNeverReachesTheVisibleText() {
        let parsed = ContentParser.parse("\(prose)\n\(block(richItem))")
        XCTAssertEqual(parsed.text, prose)
        for fragment in ["[TAPPY_PLACES]", "[/TAPPY_PLACES]", "\"items\"", "place:osm", "labelKey"] {
            XCTAssertFalse(parsed.text.contains(fragment), "\(fragment) leaked")
        }
    }

    func testATruncatedBlockStripsEvenThoughNothingDecodes() {
        let parsed = ContentParser.parse("\(prose)\n[TAPPY_PLACES]{\"v\":1,\"items\":[{\"id\":\"pl")
        XCTAssertTrue(parsed.places.isEmpty)
        XCTAssertEqual(parsed.text, prose)
        XCTAssertFalse(parsed.text.contains("TAPPY_PLACES"))
    }

    func testMalformedJSONStripsAndDecodesToNothing() {
        let parsed = ContentParser.parse("\(prose)\n[TAPPY_PLACES]{not json at all}[/TAPPY_PLACES]")
        XCTAssertTrue(parsed.places.isEmpty)
        XCTAssertEqual(parsed.text, prose)
    }

    func testAnOrphanClosingTagIsRemoved() {
        XCTAssertEqual(ContentParser.parse("\(prose)\n[/TAPPY_PLACES]").text, prose)
    }

    func testASecondBlockIsStrippedWithoutRenderingASecondSet() {
        let parsed = ContentParser.parse("\(prose)\n\(block(richItem))\n\(block(sparseItem))")
        XCTAssertEqual(parsed.places.count, 1)
        XCTAssertFalse(parsed.text.contains("TAPPY_PLACES"))
        XCTAssertFalse(parsed.text.contains("Quán Vỉa Hè"))
    }

    // MARK: - Coexistence. The server composes prose + places + CTA.

    func testACTABlockAfterThePlaceBlockSurvivesAndBothAreStripped() {
        let cta = "[CTA_BUTTONS]{\"buttons\":[{\"label\":\"Xem bản đồ\",\"type\":\"maps\",\"url\":\"https://maps.example/a\",\"primary\":true}]}[/CTA_BUTTONS]"
        let parsed = ContentParser.parse("\(prose)\n\(block(richItem))\n\(cta)")
        XCTAssertEqual(parsed.ctaButtons.count, 1, "the CTA behind the place block must still decode")
        XCTAssertEqual(parsed.ctaButtons.first?.label, "Xem bản đồ")
        XCTAssertEqual(parsed.places.count, 1)
        XCTAssertEqual(parsed.text, prose)
    }

    func testAnUnterminatedPlaceBlockDoesNotConsumeAFollowingCTA() {
        // The CTA is decoded EARLIER in the chain than places, so a places block that never closed
        // cannot take the buttons with it however far its removal reaches.
        let cta = "[CTA_BUTTONS]{\"buttons\":[{\"label\":\"Gọi\",\"type\":\"call\",\"url\":\"tel:+84281234\",\"primary\":false}]}[/CTA_BUTTONS]"
        let parsed = ContentParser.parse("\(prose)\n\(cta)\n[TAPPY_PLACES]{\"v\":1,\"items\":[{\"id\":\"pl")
        XCTAssertEqual(parsed.ctaButtons.first?.label, "Gọi")
        XCTAssertEqual(parsed.text, prose)
    }

    func testTheOtherMarkersAreUntouchedByTheNewOne() {
        let text = "[TAPPY_SHOPPING]{\"entities\":[{\"key\":\"k\",\"config\":\"Air M1\",\"matchesRequest\":\"khop\",\"offers\":[]}]}[/TAPPY_SHOPPING]\n"
            + "\(prose)\n"
            + "[TAPPY_PLAN]{\"days\":[{\"label\":\"Hôm nay\",\"items\":[{\"time\":\"10:00\",\"name\":\"Ghé quán\"}]}]}[/TAPPY_PLAN]\n"
            + "\(block(richItem))\n"
            + "[FOLLOWUPS]Quán nào gần hơn?|Có chỗ đậu xe không?"
        let parsed = ContentParser.parse(text)
        XCTAssertNotNil(parsed.plan)
        XCTAssertNotNil(parsed.shopping)
        XCTAssertEqual(parsed.followups, ["Quán nào gần hơn?", "Có chỗ đậu xe không?"])
        XCTAssertEqual(parsed.places.count, 1)
        XCTAssertEqual(parsed.text, prose)
    }

    // MARK: - The card projection

    func testAPlaceWhoseNameCouldNotBePersistedDrawsNoCard() {
        // What a Google-sourced row looks like after `mayPersist` has done its work: identifiers
        // and our own actions, and nothing a reader could identify the place by. A card with no
        // name is not a thinner card, it is an unreadable one — and re-fetching the name is what
        // the storage terms forbid.
        let googleShaped = PersistedPlace(
            id: "place:google:ChIJ_g", domain: "food", kind: "place", rank: 0,
            actions: [PersistedPlaceAction(kind: "maps", urlKind: "direct",
                                           url: "https://maps.example/g", labelKey: "v3.action.maps")]
        )
        XCTAssertNil(googleShaped.toCardView())
    }

    func testThePriceBandMirrorsWebAndAnOutOfRangeLevelShowsNothing() {
        XCTAssertEqual(placePriceBand(1), "đ")
        XCTAssertEqual(placePriceBand(4), "đđđđ")
        XCTAssertNil(placePriceBand(0))
        XCTAssertNil(placePriceBand(5))
        XCTAssertNil(placePriceBand(nil))
    }

    func testTheUnknownSentinelNeverAppearsInADecodedPlace() {
        // The server used to persist "KHONG CO DU LIEU" as if it were an address. Nothing that
        // reaches a card may contain it.
        let parsed = ContentParser.parse("\(prose)\n\(block(richItem, sparseItem))")
        for place in parsed.places {
            XCTAssertFalse((place.address ?? "").contains("KHONG CO DU LIEU"))
            XCTAssertFalse((place.openingHours ?? "").contains("KHONG CO DU LIEU"))
            XCTAssertFalse((place.name ?? "").contains("KHONG CO DU LIEU"))
        }
    }

    // MARK: - Durable restore. iOS stores raw content and parses at render.

    func testARestoredTurnRebuildsTheSameCardsFromTheStoredTextAlone() {
        let raw = "\(prose)\n\(block(richItem, sparseItem))"
        // What ChatViewModel persists for an assistant turn, and what it restores it from.
        let stored = ChatMessage(role: .assistant, content: raw).content
        XCTAssertTrue(stored.contains("[TAPPY_PLACES]"), "the saved row must keep the block")

        let live = ContentParser.parse(raw)
        let restored = ContentParser.parse(stored)
        XCTAssertEqual(live.places, restored.places)
        XCTAssertEqual(live.text, restored.text)
        XCTAssertEqual(restored.places.count, 2)
        XCTAssertFalse(restored.text.contains("TAPPY_PLACES"))
    }

    func testALiveAnnotationIsNotPartOfTheStoredContentSoItCannotDuplicateTheCard() {
        // The annotation lives on the message, never in `content`. A restored message therefore
        // has no `livePlaces`, the render falls back to the durable block, and the two cannot both
        // render for the same turn.
        let raw = "\(prose)\n\(block(richItem))"
        var msg = ChatMessage(role: .assistant, content: raw)
        msg.livePlaces = PlacesLiveView(kind: placesAnnotationKind, items: [LivePlace(id: "p1", name: "Quán Live")])
        XCTAssertFalse(msg.content.contains("Quán Live"), "the annotation must not enter the text")

        let restored = ChatMessage(role: .assistant, content: msg.content)
        XCTAssertNil(restored.livePlaces)
        XCTAssertFalse(ContentParser.parse(restored.content).places.isEmpty)
    }
}
