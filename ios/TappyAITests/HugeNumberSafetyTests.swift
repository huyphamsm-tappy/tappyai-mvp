import XCTest
@testable import TappyAI

/// A number from the server can be absurd (a hostile or broken frame). `Int(Double)` TRAPS on a value out of range, which would close the app, so
/// the two places that turn a server amount into text refuse what is beyond a sane bound instead of converting it.
final class HugeNumberSafetyTests: XCTestCase {

    func testAHotelOfferAboveATrillionIsNoOffer() throws {
        let json = #"{"kind":"tappy.places.v1","items":[{"id":"h","name":"H","stayOffer":{"platform":"Agoda","amount":1e300,"currency":"VND","unit":"total","checkedAt":"2026-11-20T02:30:00Z"}}]}"#
        let view = try ResponseDecoder.json.decode(PlacesLiveView.self, from: Data(json.utf8))
        XCTAssertEqual(view.items.count, 1, "the place stays")
        XCTAssertNil(view.items[0].toCardView().stayOffer, "no price line, and no crash")
    }

    func testTheMoneyFormatterNeverConvertsAnOutOfRangeNumber() {
        let huge = LiveStayOffer(platform: "Agoda", amount: 1e300, currency: "VND", unit: "total", nights: nil, guests: nil, checkedAt: "2026-11-20T02:30:00Z")
        XCTAssertFalse(StayOfferLine.money(huge, lang: "vi").isEmpty)
        let usd = LiveStayOffer(platform: "Agoda", amount: .infinity, currency: "USD", unit: "total", nights: nil, guests: nil, checkedAt: "2026-11-20T02:30:00Z")
        XCTAssertTrue(StayOfferLine.money(usd, lang: "en").hasSuffix(" USD"))
        let ok = LiveStayOffer(platform: "Agoda", amount: 999_999_999_999, currency: "VND", unit: "total", nights: nil, guests: nil, checkedAt: "2026-11-20T02:30:00Z")
        XCTAssertEqual(StayOfferLine.money(ok, lang: "vi"), "999.999.999.999đ", "the largest accepted price still reads normally")
    }

    func testAPriceBandBeyondTheBoundIsShownAsTheProviderWroteIt() {
        for text in ["1-99999999999999999999 N ₫", "Trên 99999999999999999999 Tr ₫", "Dưới 99999999999999999999999999 ₫", "100-999999999999999 Tr ₫"] {
            XCTAssertNil(PriceBand.parse(text), text)
            XCTAssertEqual(PriceBand.format(text, lang: "vi"), text, text)
        }
        XCTAssertNotNil(PriceBand.parse("1-100 Tr ₫"))
    }

    func testTheVndFormatterToleratesWhatItShouldNeverGet() {
        XCTAssertFalse(PriceBand.vnd(.infinity, lang: "vi").isEmpty)
        XCTAssertFalse(PriceBand.vnd(.nan, lang: "en").isEmpty)
        XCTAssertFalse(PriceBand.vnd(1e30, lang: "vi").isEmpty)
    }
}
