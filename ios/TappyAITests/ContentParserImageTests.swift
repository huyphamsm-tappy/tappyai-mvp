import XCTest
@testable import TappyAI

final class ContentParserImageTests: XCTestCase {
    func testAMarkdownImageIsDrawnByTheStripAndLeavesNoAltTextBehind() {
        let content = "Mình gợi ý bún bò nhé.\n\n![Bún bò](https://cdn.example/a.png)\n\nNguồn: https://example.vn/bun-bo"
        let parsed = ContentParser.parse(content)
        XCTAssertEqual(parsed.images.map(\.url), ["https://cdn.example/a.png"])
        XCTAssertEqual(parsed.images.first?.alt, "Bún bò")
        XCTAssertFalse(parsed.text.contains("Bún bò"), "the alt text is not a line of the message")
        XCTAssertTrue(parsed.text.contains("Mình gợi ý bún bò nhé."))
        XCTAssertTrue(parsed.text.contains("Nguồn: https://example.vn/bun-bo"), "the source line stays")
        XCTAssertFalse(parsed.text.contains("\n\n\n"), "no run of blank lines where the image was")
    }

    func testTextWithoutAnImageIsUnchanged() {
        XCTAssertEqual(ContentParser.parse("Xin chào").text, "Xin chào")
    }
}
