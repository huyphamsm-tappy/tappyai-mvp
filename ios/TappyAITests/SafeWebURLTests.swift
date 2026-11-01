import XCTest
@testable import TappyAI

/// Review 02/11 (iOS): markdown links, place cards, the seller line, media blocks, plan links and CTA buttons opened whatever
/// scheme the server's (or the model's) text carried — `tel:`, `sms:`, `itms-apps:`, `file:` — and a page of another AI product.
final class SafeWebURLTests: XCTestCase {
    func testOnlyHttpAndHttpsWithAHostOpenAnyCase() {
        XCTAssertEqual(safeWebURL("https://vnexpress.net/a")?.host, "vnexpress.net")
        XCTAssertNotNil(safeWebURL("http://example.vn/a"))
        XCTAssertNotNil(safeWebURL("HTTPS://Maps.Google.com/?cid=1"), "the scheme is not case-sensitive")
        XCTAssertNotNil(safeWebURL("  https://example.vn/a \n"), "surrounding whitespace is trimmed")
    }

    func testOtherSchemesAndAddressesWithoutAHostAreNotOpened() {
        for s in ["tel:+84123456789", "sms:+84123", "mailto:a@b.c", "itms-apps://apps.apple.com/app/id1", "javascript:alert(1)", "file:///etc/passwd",
                  "intent://x#Intent;end", "tappyai://chat", "/reviews/1", "//example.vn/a", "example.vn/a", "https://", "", "   "] {
            XCTAssertNil(safeWebURL(s), s)
        }
    }

    func testAPageOfAnotherAiProductIsNotOpened() {
        for s in ["https://chatgpt.com/share/x", "https://ai-hay.vn/a", "https://www.google.com/url?q=https://claude.ai/share/x",
                  "https://play.google.com/store/apps/details?id=vn.aihay.app"] {
            XCTAssertNil(safeWebURL(s), s)
        }
        XCTAssertNotNil(safeWebURL("https://www.anthropic.com/news/x"), "a company's own site stays")
    }

    // MARK: - Markdown links

    private func linkTargets(_ text: AttributedString) -> [String] {
        text.runs.compactMap { $0.link?.absoluteString }
    }

    func testAMarkdownLinkKeepsOnlyAWebAddressAndOtherSchemesKeepTheirLabel() {
        let rendered = ContentParser.renderMarkdown("[Gọi](tel:+84123) [Mở](https://vnexpress.net/a) [Lạ](itms-apps://x) [JS](javascript:alert(1)) [Tệp](file:///x)")
        XCTAssertEqual(linkTargets(rendered), ["https://vnexpress.net/a"])
        let plain = String(rendered.characters)
        for label in ["Gọi", "Mở", "Lạ", "JS", "Tệp"] { XCTAssertTrue(plain.contains(label), label) }
    }

    // MARK: - CTA buttons keep the web's policy (tel / mailto / http(s)) but never open an AI page or a stray scheme

    func testACTAButtonOpensAWebAddressAPhoneAndAMailButNothingElse() {
        XCTAssertNotNil(ContentParser.ctaOpenURL("https://shop.example.vn/a"))
        XCTAssertEqual(ContentParser.ctaOpenURL("tel:+84123456789")?.scheme, "tel")
        XCTAssertEqual(ContentParser.ctaOpenURL("mailto:a@b.vn")?.scheme, "mailto")
        for s in ["javascript:alert(1)", "intent://x#Intent;end", "file:///x", "itms-apps://apps.apple.com/app/id1", "https://chatgpt.com/share/x", "/reviews/1", ""] {
            XCTAssertNil(ContentParser.ctaOpenURL(s), s)
        }
    }

    func testACTAButtonThatPointsAtAnAiProductIsNotShown() {
        let reply = #"Xem nhé [CTA_BUTTONS]{"buttons":[{"label":"AIHAY","type":"external","url":"https://ai-hay.vn/a"},{"label":"Shop","type":"external","url":"https://shop.example.vn/a"}]}[/CTA_BUTTONS]"#
        XCTAssertEqual(ContentParser.parse(reply).ctaButtons.map(\.label), ["Shop"])
    }

    // MARK: - Plan links

    func testAPlanStopLinkIsAWebAddressInAnyCaseAndNeverAnAiPage() throws {
        let json = #"""
        {"title":"x","days":[{"label":"Ngày 1","items":[
          {"time":"09:00","emoji":"☕","name":"A","maps_link":"HTTPS://maps.google.com/?cid=1","booking_link":"https://chatgpt.com/share/x"},
          {"time":"10:00","emoji":"☕","name":"B","maps_link":"tel:+84123","booking_link":"http://shop.example.vn/b"}]}]}
        """#
        let plan = try ResponseDecoder.json.decode(TappyPlan.self, from: Data(json.utf8))
        let stops = PlanCardModel.of(plan).days.flatMap(\.stops)
        XCTAssertNotNil(stops[0].mapsLink, "an upper-case scheme is still https")
        XCTAssertNil(stops[0].bookingLink, "an AI product's page is not a booking link")
        XCTAssertNil(stops[1].mapsLink, "tel: is not a map link")
        XCTAssertNotNil(stops[1].bookingLink)
    }
}
