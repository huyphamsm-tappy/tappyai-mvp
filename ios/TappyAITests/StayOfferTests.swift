import XCTest
@testable import TappyAI

/// A hotel card's reference-price line (web `stayOffer.ts` / `stayOfferLine`, owner 19/11/2026): the provider's own price for this hotel with
/// the platform and the time of the check, read from the live `tappy.places.v1` annotation.
final class StayOfferTests: XCTestCase {

    private func view(_ offer: String) throws -> PlacesLiveView {
        let json = #"{"kind":"tappy.places.v1","v":1,"domain":"travel","items":[{"id":"h1","name":"Seaside Hotel","kind":"hotel","stayOffer":\#(offer)}]}"#
        return try ResponseDecoder.json.decode(PlacesLiveView.self, from: Data(json.utf8))
    }

    private let good = #"{"platform":"Agoda","amount":1200000,"currency":"VND","unit":"per_night","nights":2,"guests":2,"checkedAt":"2026-11-20T02:30:00Z"}"#

    func testAGoodOfferReachesTheCard() throws {
        let card = try XCTUnwrap(try view(good).items.first).toCardView()
        let offer = try XCTUnwrap(card.stayOffer)
        XCTAssertEqual(offer.platform, "Agoda")
        XCTAssertEqual(offer.amount, 1_200_000)
        XCTAssertEqual(offer.unit, "per_night")
        XCTAssertEqual(offer.guests, 2)
        XCTAssertEqual(offer.nights, 2)
    }

    func testABadOfferCostsOnlyTheLineNeverThePlace() throws {
        let bad = [#"{"platform":"Agoda","amount":-5,"currency":"VND","unit":"per_night","checkedAt":"2026-11-20T02:30:00Z"}"#,
                   #"{"platform":"Agoda","amount":100,"currency":"EUR","unit":"per_night","checkedAt":"2026-11-20T02:30:00Z"}"#,
                   #"{"platform":"Agoda","amount":100,"currency":"VND","unit":"per_week","checkedAt":"2026-11-20T02:30:00Z"}"#,
                   #"{"platform":"  ","amount":100,"currency":"VND","unit":"total","checkedAt":"2026-11-20T02:30:00Z"}"#,
                   #"{"platform":"Agoda","amount":100,"currency":"VND","unit":"total","checkedAt":"not a time"}"#,
                   #"{"platform":"Agoda","amount":"100","currency":"VND","unit":"total","checkedAt":"2026-11-20T02:30:00Z"}"#,
                   #""a string""#, "42", "null", "[]"]
        for offer in bad {
            let v = try view(offer)
            XCTAssertEqual(v.items.count, 1, "the place stays: \(offer)")
            XCTAssertNil(v.items[0].toCardView().stayOffer, "no offer: \(offer)")
        }
    }

    func testGuestsAndNightsOutsideOneToThirtyAreDroppedButTheOfferStays() throws {
        let o = try XCTUnwrap(try view(#"{"platform":"Agoda","amount":500000,"currency":"VND","unit":"total","guests":99,"nights":0,"checkedAt":"2026-11-20T02:30:00Z"}"#).items[0].toCardView().stayOffer)
        XCTAssertNil(o.guests)
        XCTAssertNil(o.nights)
    }

    func testAPlaceWithoutAnOfferHasNoLine() throws {
        let json = #"{"kind":"tappy.places.v1","items":[{"id":"p","name":"Quán phở"}]}"#
        let v = try ResponseDecoder.json.decode(PlacesLiveView.self, from: Data(json.utf8))
        XCTAssertNil(v.items[0].toCardView().stayOffer)
    }

    func testTheLineNamesThePlatformThePriceAndTheCheckTimeInVietnamTime() throws {
        let offer = try XCTUnwrap(try view(good).items[0].toCardView().stayOffer)
        let line = try XCTUnwrap(StayOfferLine.text(offer, lang: "vi"))
        XCTAssertTrue(line.contains("Agoda"))
        XCTAssertTrue(line.contains("09:30"), "02:30 UTC is 09:30 in Vietnam")
        XCTAssertTrue(line.contains("20/11/2026"))
        XCTAssertTrue(line.contains("1.200.000đ"), line)
        XCTAssertFalse(line.contains("{"), "every placeholder is filled")
    }

    func testMoneyIsTheProvidersFigureFormattedNeverComputed() {
        func offer(_ amount: Double, _ currency: String) -> LiveStayOffer {
            LiveStayOffer(platform: "Agoda", amount: amount, currency: currency, unit: "total", nights: nil, guests: nil, checkedAt: "2026-11-20T02:30:00Z")
        }
        XCTAssertEqual(StayOfferLine.money(offer(1_200_000, "VND"), lang: "vi"), "1.200.000đ")
        XCTAssertEqual(StayOfferLine.money(offer(1_200_000, "VND"), lang: "en"), "1,200,000 VND")
        XCTAssertEqual(StayOfferLine.money(offer(950, "VND"), lang: "vi"), "950đ")
        XCTAssertEqual(StayOfferLine.money(offer(120, "USD"), lang: "vi"), "120 USD")
        XCTAssertEqual(StayOfferLine.money(offer(120.5, "USD"), lang: "en"), "120.5 USD")
    }

    func testTheCheckTimeReadsWithAndWithoutFractionalSeconds() {
        XCTAssertNotNil(StayOfferLine.parse("2026-11-20T02:30:00Z"))
        XCTAssertNotNil(StayOfferLine.parse("2026-11-20T02:30:00.123Z"))
        XCTAssertNotNil(StayOfferLine.parse("2026-11-20T09:30:00+07:00"))
        XCTAssertNil(StayOfferLine.parse("20/11/2026"))
    }

    func testEveryStringTheLineUsesHasACatalogEntry() {
        for key in ["place.stayPriceNight", "place.stayPriceTotal", "place.stayGuests"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
