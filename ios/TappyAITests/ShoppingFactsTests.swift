import XCTest
@testable import TappyAI

/// Owner 01/11 (iOS = the web; same cases as Android `ShoppingFactsTest`). The web's shopping card shows, on every product row, the rating of
/// the offer it features (never the entity's), the stated specs and the seller's condition as chips, and the offer's own link when no verified
/// merchant handoff exists (components/chat/ShoppingDecision.tsx). iOS decoded none of rating / ratingCount / specs / condition. The server sends
/// these fields (SynthesisView); the phone reads and shows them, deriving nothing.
final class ShoppingFactsTests: XCTestCase {

    private let payload = #"""
    {"v":1,"entities":[{"key":"k0","config":"M2 · 8GB · 256GB","matchesRequest":"khop","recommended":true,
    "priceLow":21000000,"priceHigh":23500000,
    "specs":[{"key":"chip","value":"M2"},{"key":"ram","value":8},{"key":"storage","value":256}],
    "condition":{"key":"genuine","label":"Chính hãng"},
    "offers":[{"seller":"Cellphones","url":"https://cellphones.com.vn/a","price":21000000,"currency":"VND","condition":null,"rating":4.5,"ratingCount":1234},
              {"seller":"Shopee Mall","url":"https://shopee.vn/b","price":23500000,"currency":"VND","condition":null}]}],
    "recommendation":{"entityKey":"k0","seller":"Shopee Mall","reasons":[],"conditional":false}}
    """#

    private func decision(_ json: String) throws -> ShoppingDecisionView {
        try XCTUnwrap(ContentParser.parse("Đây.[TAPPY_SHOPPING]" + json + "[/TAPPY_SHOPPING]").shopping)
    }

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    func testTheRatingTheSpecsAndTheConditionTheServerSendsAreDecoded() throws {
        let e = try XCTUnwrap(decision(payload).entities.first)
        XCTAssertEqual(e.specs.map { "\($0.key)=\($0.value)" }, ["chip=M2", "ram=8", "storage=256"], "a numeric value is kept as text")
        XCTAssertEqual(e.condition?.key, "genuine")
        XCTAssertEqual(e.condition?.label, "Chính hãng")
        XCTAssertEqual(e.offers[0].rating, 4.5)
        XCTAssertEqual(e.offers[0].ratingCount, 1234)
        XCTAssertNil(e.offers[1].rating)
    }

    func testAnOlderMarkerWithoutTheseFieldsStillDecodes() throws {
        let old = #"{"v":1,"entities":[{"key":"k","config":"c","matchesRequest":"chua_ro","recommended":false,"offers":[{"seller":"S","url":"https://x.example","price":1.0}]}]}"#
        let e = try XCTUnwrap(decision(old).entities.first)
        XCTAssertTrue(e.specs.isEmpty)
        XCTAssertNil(e.condition)
        XCTAssertNil(e.offers[0].rating)
    }

    func testOneOddSpecCostsOnlyItself() throws {
        let json = #"{"v":1,"entities":[{"key":"k","config":"c","matchesRequest":"khop","recommended":false,"offers":[],"specs":[{"key":"ram","value":16},{"nope":1},{"key":"chip","value":{"x":1}},{"key":"size","value":"6.1"}]}]}"#
        let e = try XCTUnwrap(decision(json).entities.first)
        XCTAssertEqual(e.specs.map { "\($0.key)=\($0.value)" }, ["ram=16", "size=6.1"])
    }

    func testTheFeaturedOfferIsTheRecommendedSellersElseTheFirst() throws {
        let e = try XCTUnwrap(decision(payload).entities.first)
        XCTAssertEqual(featuredOffer(e, seller: "Shopee Mall")?.seller, "Shopee Mall")
        XCTAssertEqual(featuredOffer(e, seller: "Không có")?.seller, "Cellphones")
        XCTAssertEqual(featuredOffer(e, seller: nil)?.seller, "Cellphones")
        XCTAssertNil(featuredOffer(ShoppingEntityView(key: "k", config: "c", matchesRequest: ShoppingMatch.unknown), seller: nil))
    }

    func testTheRatingIsTheFeaturedListingsOwnItsCountGroupedAsTheReadersLanguageWritesIt() {
        XCTAssertEqual(ratingFacts(rating: 4.5, count: 1234, lang: "vi"), RatingFacts(value: "4.5", count: "1.234"))
        XCTAssertEqual(ratingFacts(rating: 4.5, count: 1234, lang: "en"), RatingFacts(value: "4.5", count: "1,234"))
        XCTAssertEqual(ratingFacts(rating: 4.5, count: nil, lang: "vi"), RatingFacts(value: "4.5", count: nil))
        XCTAssertEqual(ratingFacts(rating: 4.5, count: 0, lang: "vi"), RatingFacts(value: "4.5", count: nil))
        XCTAssertEqual(ratingFacts(rating: 5, count: 12, lang: "en"), RatingFacts(value: "5", count: "12"))
        XCTAssertNil(ratingFacts(rating: nil, count: 12, lang: "vi"))
    }

    func testTheChipsAreTheLabelledSpecsThenTheConditionNothingStatedMeansNothingShown() throws {
        let e = try XCTUnwrap(decision(payload).entities.first)
        let chips = specChips(
            e,
            spec: { k, v in k == "ram" ? "\(v)GB RAM" : (k == "storage" ? "\(v)GB bộ nhớ" : v) },
            condition: { k in k == "genuine" ? "Chính hãng" : nil })
        XCTAssertEqual(chips, ["M2", "8GB RAM", "256GB bộ nhớ", "Chính hãng"])
        // a condition with no dictionary entry is the seller's own wording
        let own = ShoppingEntityView(key: "k", config: "c", matchesRequest: ShoppingMatch.unknown,
                                     condition: ShoppingConditionView(key: nil, label: "Hàng trưng bày"))
        XCTAssertEqual(specChips(own, spec: { _, v in v }, condition: { _ in nil }), ["Hàng trưng bày"])
        let bare = ShoppingEntityView(key: "k", config: "c", matchesRequest: ShoppingMatch.unknown)
        XCTAssertTrue(specChips(bare, spec: { _, v in v }, condition: { _ in nil }).isEmpty)
    }

    func testTheConditionKeysTheCardTranslatesAreAllInTheCatalog() throws {
        let catalog = try source("TappyAI/Resources/Localizable.xcstrings")
        for key in ShoppingFactsLabels.conditionKeys {
            XCTAssertTrue(catalog.contains("\"shoppingDecision.condition.\(key)\""), key)
        }
        for key in ["shoppingDecision.ratingLine", "shoppingDecision.ratingOnly", "shoppingDecision.specRam", "shoppingDecision.specStorage"] {
            XCTAssertTrue(catalog.contains("\"\(key)\""), key)
        }
        XCTAssertNil(ShoppingFactsLabels.condition(key: "not-a-key"), "a key the app does not know falls back to the seller's wording")
    }

    func testTheCardShowsThemAndAnAlternativeWithNoHandoffKeepsItsOfferLink() throws {
        let card = try source("TappyAI/Features/Chat/UI/ShoppingDecisionCardView.swift")
        XCTAssertTrue(card.contains("specChips("))
        XCTAssertTrue(card.contains("ratingFacts("))
        XCTAssertTrue(card.contains("featuredOffer("))
        // the alternative row, like the recommended one, falls back to the offer's own link while no detail handoff exists
        let alt = try XCTUnwrap(card.components(separatedBy: "private func alternativeRow").last)
        XCTAssertTrue(alt.contains("handoffs.detail.isEmpty") && alt.contains("offerRow("))
    }
}
