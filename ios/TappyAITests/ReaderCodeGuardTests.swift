import XCTest
@testable import TappyAI

/// The quick-read sheet must never show a page's CSS or script as the article (owner UAT: «báo lỗi code» on a CNBC source).
final class ReaderCodeGuardTests: XCTestCase {
    private let css1 = #"@charset "UTF-8";.Modal-modalBackground{background:#000000b3;height:100%;left:0;overflow-y:auto;position:fixed;top:0;transition:background-color .4s;width:100%;z-index:100001}.Modal-modalBackgroundBlur{backdrop-filter:blur(4px)}"#
    private let css2 = #"@charset "UTF-8";@keyframes countdown-clock-slide-in{0%{height:0}to{height:42px}}@keyframes countdown-clock-slide-out{0%{height:42px}to{height:0}}.countdown-clock-container{align-items:center}"#

    func testCssIsRecognisedAsCode() {
        XCTAssertTrue(LinkPreview.looksLikeCode(css1))
        XCTAssertTrue(LinkPreview.looksLikeCode(css2))
        XCTAssertTrue(LinkPreview.looksLikeCode("(function(){var a=document.createElement('div');window.x=1;})();"))
        XCTAssertTrue(LinkPreview.looksLikeCode("!function(e){e.a=1;e.b=2}(window);"))
    }

    func testOrdinaryProseIsKept() {
        XCTAssertFalse(LinkPreview.looksLikeCode("The test flight is SpaceX's first attempt to catch both the Super Heavy booster and upper stage spacecraft of the rocket at its launch site in Starbase, Texas."))
        XCTAssertFalse(LinkPreview.looksLikeCode("Chuyến bay thử thứ 15 diễn ra ngày 13/11/2026; SpaceX lần đầu thử thu hồi cả hai tầng (booster và tàu trên)."))
        XCTAssertFalse(LinkPreview.looksLikeCode(""))
    }

    func testTheReaderDropsCodePassagesAndKeepsTheArticle() {
        let json: [String: Any] = [
            "ok": true, "title": "SpaceX launches Starship", "siteName": "CNBC",
            "description": "The test flight is SpaceX's first attempt to catch both the booster and the upper stage.",
            "passages": ["The test flight is SpaceX's first attempt to catch the Super Heavy booster.", css1, css2],
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let preview = LinkPreview.read(data)
        XCTAssertTrue(preview.ok)
        XCTAssertEqual(preview.passages.count, 1)
        XCTAssertNotNil(preview.description)
    }

    func testACodeDescriptionIsDropped() {
        let data = try! JSONSerialization.data(withJSONObject: ["ok": true, "description": css1, "passages": []] as [String: Any])
        XCTAssertNil(LinkPreview.read(data).description)
    }
}
