import XCTest
@testable import TappyAI

/// Review 02/11 (iOS = Android `CompactVndTest`): the compact price on a shopping card CUT instead of rounding ("24.990.000" read
/// "24.9 triệu", a lower price than the shop's), used a point where Vietnamese reads a comma, showed "0k" for a price under 1.000 and a
/// cut "Nk" for one between 1.000 and 999.999 — and `Int(amount)` traps on a non-finite value. A card must not state a price the
/// server did not.
final class CompactVndTests: XCTestCase {
    func testMillionsAreRoundedToOneDecimalWithAComma() {
        XCTAssertEqual(formatCompactVnd(25_990_000), "26 triệu")
        XCTAssertEqual(formatCompactVnd(24_990_000), "25 triệu")
        XCTAssertEqual(formatCompactVnd(25_800_000), "25,8 triệu")
        XCTAssertEqual(formatCompactVnd(2_000_000), "2 triệu")
        XCTAssertEqual(formatCompactVnd(1_500_000), "1,5 triệu")
        XCTAssertEqual(formatCompactVnd(1_049_999), "1 triệu")
    }

    func testJustUnderAMillionThatRoundsUpReadsAsAMillion() {
        XCTAssertEqual(formatCompactVnd(999_960), "1 triệu")
        XCTAssertEqual(formatCompactVnd(999_950), "1 triệu")
        XCTAssertEqual(formatCompactVnd(999_949), "999.949đ")
    }

    func testAnythingBelowThatKeepsItsExactValue() {
        XCTAssertEqual(formatCompactVnd(250_000), "250k")
        XCTAssertEqual(formatCompactVnd(249_500), "249.500đ")
        XCTAssertEqual(formatCompactVnd(1_000), "1k")
        XCTAssertEqual(formatCompactVnd(999), "999đ")
        XCTAssertEqual(formatCompactVnd(500), "500đ")
    }

    func testAnAmountThatIsNotAFiniteNumberNeverTrapsAndIsNotPresentedAsAPrice() {
        XCTAssertEqual(shoppingPriceRangeText(low: .nan, high: nil, unknown: "chưa rõ"), "chưa rõ")
        XCTAssertEqual(shoppingPriceRangeText(low: .infinity, high: 250_000, unknown: "chưa rõ"), "250k")
        XCTAssertEqual(shoppingPriceRangeText(low: nil, high: .nan, unknown: "chưa rõ"), "chưa rõ")
    }

    func testTwoBoundsThatRoundToTheSameTextAreOnePrice() {
        XCTAssertEqual(shoppingPriceRangeText(low: 24_990_000, high: 25_010_000, unknown: "chưa rõ"), "25 triệu")
    }
}
