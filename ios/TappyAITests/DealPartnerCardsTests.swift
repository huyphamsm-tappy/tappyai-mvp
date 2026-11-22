import XCTest
@testable import TappyAI

/// The Deals page as the web draws it (owner 20/11/2026): only Accesstrade, Lazada, Agoda and Vexere, and — with no managed deal — the booking
/// partners that have a tracked link (`GET /api/deals/partners`). Rules: web `partnerAllowlist.ts`, `DealsView.tsx`.
final class DealPartnerCardsTests: XCTestCase {

    func testOnlyTheFourPartnersPass() {
        for ok in ["Lazada", "lazada.vn", "Accesstrade VN", "Agoda", "AGODA", "Vexere", "VeXeRe"] {
            XCTAssertTrue(DealPartnerAllowlist.isAllowed(ok), ok)
        }
        for no in ["Shopee", "Grab", "Booking.com", "notagoda", "", "  ..  ", "Traveloka"] {
            XCTAssertFalse(DealPartnerAllowlist.isAllowed(no), no)
        }
        XCTAssertFalse(DealPartnerAllowlist.isAllowed(nil))
    }

    func testThePartnerListDecodesAndDropsTheBadRows() throws {
        let json = #"{"success":true,"partners":[{"providerId":"vexere","partnerName":"Vexere","descriptionKey":"deals.partner.vexere","url":"/go/at?x=1"},{"providerId":"x"},{"providerId":"agoda","partnerName":"Agoda","descriptionKey":"deals.partner.agoda","url":"https://example.com/a"}]}"#
        let r = try ResponseDecoder.json.decode(DealPartnerCardsResponse.self, from: Data(json.utf8))
        XCTAssertEqual(r.partners.map(\.providerId), ["vexere", "agoda"])
        XCTAssertEqual(try ResponseDecoder.json.decode(DealPartnerCardsResponse.self, from: Data("{}".utf8)).partners, [])
    }

    func testACardOpensItsTrackedLinkOnlyWhenItIsSafe() throws {
        let base = try XCTUnwrap(URL(string: "https://www.tappyai.com"))
        func card(_ url: String) -> DealPartnerCard { DealPartnerCard(providerId: "p", partnerName: "Vexere", descriptionKey: "k", url: url) }
        XCTAssertEqual(DealPartnerCardLink.url(for: card("/go/at?p=1&s=2"), base: base)?.absoluteString, "https://www.tappyai.com/go/at?p=1&s=2")
        XCTAssertEqual(DealPartnerCardLink.url(for: card("https://ul.pub/abc"), base: base)?.absoluteString, "https://ul.pub/abc")
        for bad in ["", "http://example.com", "javascript:alert(1)", "tel:113", "//evil.example/x", "/go/at x", "mailto:a@b.c"] {
            XCTAssertNil(DealPartnerCardLink.url(for: card(bad), base: base), bad)
        }
    }

    func testEveryStringThePartnerCardsShowHasACatalogEntry() {
        for key in ["deals.partnersTitle", "deals.partnersHint", "deals.partnerCta", "deals.partner.traveloka",
                    "deals.partner.vexere", "deals.partner.agoda", "deals.partner.lazada"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
