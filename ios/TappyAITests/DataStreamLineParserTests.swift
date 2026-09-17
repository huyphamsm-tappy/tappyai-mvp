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

    func testAnnotationFrameCarriesPayload() {
        // `8:[…]` is where the `tappy.places.v1` recommendation rides (share parity with web/Android).
        if case let .annotation(data)? = DataStreamLineParser.parse(line: "8:[{\"kind\":\"tappy.places.v1\"}]") {
            XCTAssertFalse(data.isEmpty)
        } else { XCTFail("expected annotation") }
    }

    func testUnknownPrefixIsPreserved() {
        if case let .unknown(prefix, _)? = DataStreamLineParser.parse(line: "z:{}") {
            XCTAssertEqual(prefix, "z")
        } else { XCTFail("expected unknown") }
    }

    func testLineWithoutColonIsIgnored() {
        XCTAssertNil(DataStreamLineParser.parse(line: "no-colon-here"))
    }

    // MARK: - The `8:` annotation, which used to fall into `.unknown` and be dropped

    /// 🚨 THE STREAM WAS NEVER TEXT-ONLY. The server has sent the turn's place decision on the
    /// annotation part since web gained its place card; iOS classified the line as unknown and
    /// threw it away, so the same reply produced a rich decision card in the browser and bare
    /// prose on the phone. Reading it changes nothing about the server contract.
    func testPlacesAnnotationIsRead() {
        let line = "8:[{\"kind\":\"tappy.places.v1\",\"v\":1,\"domain\":\"food\",\"ranked\":true,"
            + "\"items\":[{\"id\":\"p1\",\"name\":\"Quán Live\",\"rating\":4.8,\"ratingCount\":320,"
            + "\"categories\":[\"cafe\"],\"rank\":0,\"actions\":[]}]}]"
        guard case let .places(view)? = DataStreamLineParser.parse(line: line) else {
            return XCTFail("expected a places annotation")
        }
        XCTAssertEqual(view.kind, placesAnnotationKind)
        XCTAssertEqual(view.items.count, 1)
        let card = view.items[0].toCardView()
        XCTAssertEqual(card.name, "Quán Live")
        XCTAssertEqual(card.rating, 4.8)
        XCTAssertEqual(card.categories, ["cafe"])
    }

    func testAnAnnotationOfAnotherKindIsNotMistakenForPlaces() {
        // The `8:` part is shared. An annotation this version does not recognise must fall through
        // to `.unknown` — never be read as a place set, and never crash.
        let line = "8:[{\"kind\":\"something.else.v1\",\"items\":[{\"id\":\"p1\",\"name\":\"Không phải quán\"}]}]"
        guard case let .unknown(prefix, _)? = DataStreamLineParser.parse(line: line) else {
            return XCTFail("expected unknown")
        }
        XCTAssertEqual(prefix, "8")
    }

    func testAMalformedAnnotationDegradesToUnknown() {
        guard case .unknown? = DataStreamLineParser.parse(line: "8:{not an array}") else {
            return XCTFail("expected unknown")
        }
    }

    func testAnEmptyPlacesAnnotationIsNotAnEmptyCard() {
        let line = "8:[{\"kind\":\"tappy.places.v1\",\"items\":[]}]"
        guard case .unknown? = DataStreamLineParser.parse(line: line) else {
            return XCTFail("an empty item list must not become a places frame")
        }
    }
}
