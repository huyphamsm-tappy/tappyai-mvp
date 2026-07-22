import XCTest
@testable import TappyAI

/// The chat stream parser is load-bearing (docs/ios/04 §chat, F3). These lock its frame decoding.
final class DataStreamLineParserTests: XCTestCase {
    func testTextFrameDecodesJSONString() {
        XCTAssertEqual(DataStreamLineParser.parse(line: "0:\"hello\""), .text("hello"))
    }

    func testMessageStartCarriesPayload() {
        // `f:{messageId}` opens every /api/chat stream (Web parity, 2026-07-11 sync).
        if case let .messageStart(data)? = DataStreamLineParser.parse(line: "f:{\"messageId\":\"msg-1\"}") {
            XCTAssertFalse(data.isEmpty)
        } else { XCTFail("expected messageStart") }
    }

    func testDoneFrame() {
        XCTAssertEqual(DataStreamLineParser.parse(line: "d:{}"), .done)
    }

    func testStepEndFrame() {
        XCTAssertEqual(DataStreamLineParser.parse(line: "e:{\"finishReason\":\"stop\"}"), .stepEnd)
    }

    func testToolCallCarriesPayload() {
        if case let .toolCall(data)? = DataStreamLineParser.parse(line: "9:{\"tool\":\"search\"}") {
            XCTAssertFalse(data.isEmpty)
        } else { XCTFail("expected toolCall") }
    }

    func testUnknownPrefixIsPreserved() {
        if case let .unknown(prefix, _)? = DataStreamLineParser.parse(line: "z:{}") {
            XCTAssertEqual(prefix, "z")
        } else { XCTFail("expected unknown") }
    }

    func testLineWithoutColonIsIgnored() {
        XCTAssertNil(DataStreamLineParser.parse(line: "no-colon-here"))
    }
}
