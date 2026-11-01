import XCTest
@testable import TappyAI

/// Review 02/11 (iOS): a markdown image whose address has brackets was cut at the first ")" (the rest of the address stayed in the
/// text as ".jpg)"), http images were drawn, "Copy plaintext" swallowed the address of every link and the "*" between two numbers,
/// and the menu offered "Copy ID" (the message id is no business of the person; the web has no such item).
final class PlainTextAndImageBracketTests: XCTestCase {
    private let wiki = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo_(bar).jpg"

    func testAnImageWhoseAddressHasBracketsIsOneImageAndLeavesNothingBehind() {
        let parsed = ContentParser.parse("Xem:\n\n![Foo](\(wiki))\n\nHết.")
        XCTAssertEqual(parsed.images.map(\.url), [wiki])
        XCTAssertFalse(parsed.text.contains(".jpg"), "no tail of the address in the text")
        XCTAssertFalse(parsed.text.contains(")"), "no stray bracket in the text")
        XCTAssertTrue(parsed.text.contains("Hết."))
    }

    func testOnlyAnHttpsImageIsDrawnAndAnHttpOneIsNotLeftInTheText() {
        let parsed = ContentParser.parse("A ![x](http://cdn.example/a.png) B ![y](https://cdn.example/b.png) C")
        XCTAssertEqual(parsed.images.map(\.url), ["https://cdn.example/b.png"])
        XCTAssertFalse(parsed.text.contains("cdn.example"))
        XCTAssertFalse(parsed.text.contains("!["))
    }

    // MARK: - Copy plaintext

    func testPlainTextKeepsTheAddressOfALinkWhenCopying() {
        let md = "Xem [VnExpress](https://vnexpress.net/a) và [Foo](https://x.org/Foo_(bar)) nhé."
        let plain = TTSManager.stripMarkdown(md, keepLinkAddresses: true)
        XCTAssertEqual(plain, "Xem VnExpress (https://vnexpress.net/a) và Foo (https://x.org/Foo_(bar)) nhé.")
    }

    func testSpeechStillDropsTheAddress() {
        XCTAssertEqual(TTSManager.stripMarkdown("Xem [VnExpress](https://vnexpress.net/a) nhé. Hoặc https://x.vn/b"), "Xem VnExpress nhé. Hoặc")
    }

    func testPlainTextDoesNotSwallowAStarBetweenNumbers() {
        XCTAssertEqual(TTSManager.stripMarkdown("5 * 3 * 2 = 30", keepLinkAddresses: true), "5 * 3 * 2 = 30")
        XCTAssertEqual(TTSManager.stripMarkdown("2*3*4", keepLinkAddresses: true), "2*3*4")
        XCTAssertEqual(TTSManager.stripMarkdown("* một\n* hai", keepLinkAddresses: true), "* một\n* hai", "a bullet is not emphasis")
    }

    func testPlainTextStillRemovesRealEmphasisAndHeadings() {
        XCTAssertEqual(TTSManager.stripMarkdown("## Tiêu đề\n**đậm** và *nghiêng*", keepLinkAddresses: true), "Tiêu đề\nđậm và nghiêng")
    }

    // MARK: - The menu

    func testTheMoreMenuHasNoCopyIdAndCopiesPlaintextWithItsLinks() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let bar = try String(contentsOf: root.appendingPathComponent("TappyAI/Features/Chat/UI/MessageActionBar.swift"), encoding: .utf8)
        XCTAssertFalse(bar.contains("chat.copyId"), "the message id is not offered")
        XCTAssertFalse(bar.contains("UIPasteboard.general.string = msgId"))
        XCTAssertTrue(bar.contains("stripMarkdown(text, keepLinkAddresses: true)"))
    }
}
