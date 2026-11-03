import XCTest
@testable import TappyAI

/// The block drawing is wired where the reply is drawn, and keeps its promises (names for VoiceOver, no door of its own to the outside).
/// Source checks, like the other wiring tests of the chat: the drawing itself needs a device.
final class MarkdownBlocksViewWiringTests: XCTestCase {
    private func source(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func testTheReplyBubbleDrawsALaidOutAnswerOnlyWhenItNeedsOneAndKeepsTheOldTextViewOtherwise() throws {
        let list = try source("TappyAI/Features/Chat/UI/ChatMessageList.swift")
        XCTAssertTrue(list.contains("ArticleLayout.layout("), "one place decides, once")
        XCTAssertTrue(list.contains("MarkdownBlocksView("))
        XCTAssertTrue(list.contains("ArticlePictureView("))
        XCTAssertTrue(list.contains("ResearchChartView("), "a chart is drawn in its place in the layout")
        XCTAssertTrue(list.contains("Text(attributedContent)"), "plain prose keeps the single text view")
        XCTAssertTrue(list.contains("segments: parsed.segments"))
        XCTAssertTrue(list.contains("docMedia: msg.docMedia"))
    }

    func testTheListParsesThroughTheCacheNotOnEveryPassOfItsBody() throws {
        let list = try source("TappyAI/Features/Chat/UI/ChatMessageList.swift")
        XCTAssertTrue(list.contains("parseCache.parsed(id: msg.id"))
        XCTAssertFalse(list.contains("ContentParser.parse(msg.content)"), "a long streaming report parsed every reply on every token")
        XCTAssertTrue(list.contains("isStreaming: isStreaming && isLast"), "only the reply being written is throttled")
        XCTAssertTrue(list.contains("hasPendingRefresh"), "words held back by the throttle are drawn once the stream pauses")
    }

    func testTheBlocksAreNamedForVoiceOverAndOpenNoAddressThemselves() throws {
        let view = try source("TappyAI/Features/Chat/UI/MarkdownBlocksView.swift")
        XCTAssertTrue(view.contains(".isHeader"), "a heading is a heading to VoiceOver")
        XCTAssertTrue(view.contains("Grid("), "the table is a grid")
        XCTAssertTrue(view.contains("chat.table.label"))
        XCTAssertTrue(view.contains("chat.table.size"))
        XCTAssertTrue(view.contains("ContentParser.renderMarkdown("), "one inline reader")
        for forbidden in ["UIApplication", "openURL", "Link(destination", ".open("] {
            XCTAssertFalse(view.contains(forbidden), "the block views never open an address (3.1.1 review list)")
        }
    }

    func testTheTableWordsAreInTheCatalogInBothLanguages() throws {
        let catalog = try source("TappyAI/Resources/Localizable.xcstrings")
        let data = try XCTUnwrap(catalog.data(using: .utf8))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(json["strings"] as? [String: Any])
        for key in ["chat.table.label", "chat.table.size %lld %lld"] {
            let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
            XCTAssertNotNil(localizations["en"], key)
            XCTAssertNotNil(localizations["vi"], key)
        }
    }
}
