import XCTest
@testable import TappyAI

/// P4-07 — the comparison iOS renders is DERIVED from the decision the reply already carried.
///
/// These are the same rules web's `comparisonFromSynthesis.test.ts` and Android's
/// `ShoppingComparisonTest.kt` pin, asserted here so the three platforms cannot drift on the part
/// that matters: what the client is allowed to conclude on its own. The answer is nothing.
///
/// ⚠️ UNVERIFIED — requires macOS/Xcode. This file has never been compiled or run; there is no
/// Swift toolchain on the machine the implementation was written on.
final class ShoppingComparisonTests: XCTestCase {

    private let labels = ComparisonLabels(
        price: "Giá",
        match: "Khớp yêu cầu",
        sellers: "Nơi bán",
        unknown: "chưa rõ",
        matchExact: "Đúng cấu hình",
        matchDifferent: "Khác cấu hình",
        matchUnknown: "Chưa rõ cấu hình",
        sellerCount: { "\($0) nơi bán" },
        priceRange: { low, high in shoppingPriceRangeText(low: low, high: high, unknown: "chưa rõ") }
    )

    private func entity(
        key: String = "e1",
        config: String = "Air M1",
        match: String = ShoppingMatch.exact,
        recommended: Bool = false,
        low: Double? = 18_990_000,
        high: Double? = 20_490_000,
        offers: Int = 0
    ) -> ShoppingEntityView {
        ShoppingEntityView(
            key: key,
            config: config,
            matchesRequest: match,
            recommended: recommended,
            priceLow: low,
            priceHigh: high,
            offers: (0..<offers).map { _ in
                ShoppingOfferView(seller: "CPS", url: nil, price: 1, currency: "VND", condition: nil)
            }
        )
    }

    private func view(
        _ entities: [ShoppingEntityView],
        recommendation: ShoppingRecommendationView? = nil
    ) -> ShoppingDecisionView {
        ShoppingDecisionView(entities: entities, recommendation: recommendation)
    }

    func testNotOfferedBelowTwoEntities() {
        XCTAssertNil(shoppingComparison(from: view([entity()]), labels: labels))
        XCTAssertNil(shoppingComparison(from: view([]), labels: labels))
        XCTAssertNil(shoppingComparison(from: nil, labels: labels))
    }

    func testCapsAtFourEntities() {
        let five = (1...5).map { entity(key: "e\($0)") }
        XCTAssertEqual(shoppingComparison(from: view(five), labels: labels)?.entities.count, 4)
    }

    func testRestatesOnlyServerSuppliedFields() {
        let c = shoppingComparison(from: view([entity(key: "a"), entity(key: "b")]), labels: labels)!
        XCTAssertEqual(c.attributes.map(\.key), ["price", "match", "sellers"])
        for forbidden in ["cheapest", "best", "score", "rank", "value"] {
            XCTAssertFalse(c.attributes.contains { $0.key == forbidden },
                           "the client must form no opinion the server did not state")
        }
    }

    func testNoOffersIsUnknownNotZeroSellers() {
        let c = shoppingComparison(from: view([entity(key: "a"), entity(key: "b")]), labels: labels)!
        XCTAssertNil(c.entities[0].values["sellers"] ?? nil)
    }

    func testRecommendationMarkedOnlyWithAReason() {
        let entities = [entity(key: "a", recommended: true), entity(key: "b")]

        let withReason = shoppingComparison(
            from: view(entities, recommendation: ShoppingRecommendationView(entityKey: "a", reasons: [ShoppingReason(attribute: "gia", evidence: "Rẻ hơn 6 triệu")])),
            labels: labels
        )!
        XCTAssertEqual(withReason.recommendedKey, "a")
        XCTAssertEqual(withReason.reason, "Rẻ hơn 6 triệu")

        let withoutReason = shoppingComparison(
            from: view(entities, recommendation: ShoppingRecommendationView(entityKey: "a", reasons: [])),
            labels: labels
        )!
        XCTAssertNil(withoutReason.recommendedKey, "DD-005: a recommendation without a reason is not shipped")
        XCTAssertNil(withoutReason.reason)
    }

    func testRecommendationPointingElsewhereIsIgnored() {
        let c = shoppingComparison(
            from: view(
                [entity(key: "a", recommended: true), entity(key: "b")],
                recommendation: ShoppingRecommendationView(entityKey: "b", reasons: [ShoppingReason(attribute: "x", evidence: "unrelated")])
            ),
            labels: labels
        )!
        XCTAssertNil(c.recommendedKey)
    }

    // MARK: - Row partitioning

    func testAttributeNobodyHasIsDropped() {
        let entities = [
            ComparisonEntity(key: "a", label: "A", values: ["price": "1", "wifi": nil]),
            ComparisonEntity(key: "b", label: "B", values: ["price": "2", "wifi": nil]),
        ]
        let attrs = [ComparisonAttribute(key: "price", label: "Giá"), ComparisonAttribute(key: "wifi", label: "Wifi")]
        let (differing, identical) = partitionComparisonAttributes(entities: entities, attributes: attrs)
        XCTAssertFalse((differing + identical).contains { $0.key == "wifi" })
    }

    func testIdenticalRowsAreFoldedAway() {
        let entities = [
            ComparisonEntity(key: "a", label: "A", values: ["price": "100k", "book": "Có"]),
            ComparisonEntity(key: "b", label: "B", values: ["price": "200k", "book": "Có"]),
        ]
        let attrs = [ComparisonAttribute(key: "price", label: "Giá"), ComparisonAttribute(key: "book", label: "Đặt bàn")]
        let (differing, identical) = partitionComparisonAttributes(entities: entities, attributes: attrs)
        XCTAssertEqual(differing.map(\.key), ["price"])
        XCTAssertEqual(identical.map(\.key), ["book"])
    }

    func testPartiallyUnknownCountsAsDiffering() {
        let entities = [
            ComparisonEntity(key: "a", label: "A", values: ["book": "Có"]),
            ComparisonEntity(key: "b", label: "B", values: ["book": nil]),
        ]
        let attrs = [ComparisonAttribute(key: "book", label: "Đặt bàn")]
        let (differing, identical) = partitionComparisonAttributes(entities: entities, attributes: attrs)
        XCTAssertEqual(differing.map(\.key), ["book"])
        XCTAssertTrue(identical.isEmpty, "calling it the same for all would be a claim the data does not support")
    }

    // MARK: - The honesty rule at its most breakable point

    func testPriceRangeRendersBothBoundsOneBoundOrAnExplicitUnknown() {
        XCTAssertEqual(shoppingPriceRangeText(low: 18_990_000, high: 20_490_000, unknown: "chưa rõ"), "18.9 triệu – 20.4 triệu")
        XCTAssertEqual(shoppingPriceRangeText(low: 24_990_000, high: nil, unknown: "chưa rõ"), "24.9 triệu")
        XCTAssertEqual(shoppingPriceRangeText(low: nil, high: 24_990_000, unknown: "chưa rõ"), "24.9 triệu")
        XCTAssertEqual(shoppingPriceRangeText(low: nil, high: nil, unknown: "chưa rõ"), "chưa rõ")
    }

    func testSinglePointPriceIsNotAFakeRange() {
        XCTAssertEqual(shoppingPriceRangeText(low: 18_990_000, high: 18_990_000, unknown: "chưa rõ"), "18.9 triệu")
    }
}
