import XCTest
@testable import TappyAI

/// Layout step 5 (owner spec 26/11, BƯỚC 5): the reply's action buttons are not repeated under the answer when a place card already offers them,
/// and the frames this build does not know (the sponsored and turn annotations) draw nothing and break nothing.
final class LayoutStep5Tests: XCTestCase {

    private func button(_ label: String, _ url: String) -> CTAButton {
        CTAButton(label: label, type: "website", url: url, primary: false)
    }

    // MARK: Buttons a place card already has

    func testAButtonWhoseAddressIsOnAPlaceCardIsNotRepeated() {
        let buttons = [button("Bản đồ", "https://maps.google.com/?q=a"), button("Trang web", "https://example.com/a")]
        let shown = PresentationRules.ctaButtonsNotOnPlaces(buttons, placeURLs: ["https://maps.google.com/?q=a&hl=vi"])
        XCTAssertEqual(shown.map(\.label), ["Trang web"], "the same page, with another query, is the same button")
    }

    func testButtonsWithNoPlaceCardStayAsTheyAre() {
        let buttons = [button("Trang web", "https://example.com/a")]
        XCTAssertEqual(PresentationRules.ctaButtonsNotOnPlaces(buttons, placeURLs: []), buttons)
    }

    func testTheAddressKeyIgnoresQueryFragmentAndCase() {
        XCTAssertEqual(PresentationRules.addressKey("HTTPS://Example.com/Page?x=1#top"), PresentationRules.addressKey("https://example.com/page"))
        XCTAssertNotEqual(PresentationRules.addressKey("https://example.com/a"), PresentationRules.addressKey("https://example.com/b"))
    }

    // MARK: Frames this build does not know

    func testASponsoredFrameIsNotDrawnAsAnything() {
        let line = "8:[{\"kind\":\"tappy.sponsored.v1\",\"v\":1,\"title\":\"Quảng cáo\",\"url\":\"https://example.com\"}]"
        let frames = DataStreamLineParser.frames(line: line)
        XCTAssertFalse(frames.contains { if case .places = $0 { return true } else { return false } })
        XCTAssertFalse(frames.contains { if case .presentation = $0 { return true } else { return false } })
        XCTAssertTrue(frames.allSatisfy { if case .unknown = $0 { return true } else { return false } }, "an unknown kind is carried, not shown")
    }

    func testATurnFrameIsIgnored() {
        let line = "8:[{\"kind\":\"tappy.turn.v1\",\"v\":1,\"cost\":{\"usd\":0.01}}]"
        let frames = DataStreamLineParser.frames(line: line)
        XCTAssertTrue(frames.allSatisfy { if case .unknown = $0 { return true } else { return false } })
        XCTAssertFalse(frames.contains(.done))
    }

    func testAKnownFrameInTheSameLineIsStillRead() {
        let line = "8:[{\"kind\":\"tappy.sponsored.v1\",\"v\":1},{\"kind\":\"tappy.turn_status.v1\",\"v\":1,\"status\":\"interrupted\"}]"
        XCTAssertTrue(DataStreamLineParser.frames(line: line).contains(.turnStatus(.interrupted)),
                      "a foreign element does not hide the element after it")
    }
}
