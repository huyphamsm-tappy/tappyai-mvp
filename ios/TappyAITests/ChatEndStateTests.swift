import XCTest
@testable import TappyAI

/// Phase K (web parity): how a reply that did not finish cleanly is told to the person.
///  · `tappy.turn_status.v1` (`8:` annotation, status `incomplete` | `interrupted`) → a fixed line under the reply;
///  · a body that closed without its `d:` finish frame (web `streamCut.ts`) → «answer again»;
///  · a `3:` error part AFTER some text → the interrupted line (before, the half reply finished silently).
/// None of it is answer text, and none of it makes a billing claim: only the server decides about a refund.
@MainActor
final class ChatEndStateTests: XCTestCase {

    private func status(_ value: String) -> String {
        "8:[{\"kind\":\"tappy.turn_status.v1\",\"v\":1,\"status\":\"\(value)\",\"reason\":\"deadline\"}]"
    }

    private func chat(_ lines: [String]) async -> ChatViewModel {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        let vm = ChatViewModel(service: ChatService(api: MockAPIClient(), streaming: ScriptedEndStateStreaming(lines: lines)), session: session)
        vm.inputText = "Hôm nay có tin gì mới?"
        vm.send()
        var waited = 0
        while vm.isStreaming, waited < 250 { try? await Task.sleep(nanoseconds: 20_000_000); waited += 1 }
        return vm
    }

    // MARK: - Frame parser

    func testTurnStatusFramesAreRead() {
        XCTAssertEqual(DataStreamLineParser.parse(line: status("incomplete")), .turnStatus(.incomplete))
        XCTAssertEqual(DataStreamLineParser.parse(line: status("interrupted")), .turnStatus(.interrupted))
    }

    func testAnUnknownStatusValueIsIgnored() {
        guard case let .unknown(prefix, _)? = DataStreamLineParser.parse(line: status("refunded")) else {
            return XCTFail("an unknown status must stay an unknown frame")
        }
        XCTAssertEqual(prefix, "8")
    }

    func testAPlacesAnnotationIsStillAPlacesFrame() {
        let line = "8:[{\"kind\":\"tappy.places.v1\",\"v\":1,\"domain\":\"food\",\"ranked\":true,"
            + "\"items\":[{\"id\":\"p1\",\"name\":\"Quán Live\",\"rank\":0,\"actions\":[]}]}]"
        guard case .places? = DataStreamLineParser.parse(line: line) else { return XCTFail("expected places") }
    }

    // MARK: - View model

    func testACleanReplyHasNoNotice() async {
        let vm = await chat(["0:\"Xin chào\"", "d:{\"finishReason\":\"stop\"}"])
        XCTAssertNil(vm.endNotice)
        XCTAssertNil(vm.error)
    }

    func testTheServersTurnStatusBecomesTheNoticeAndNeverAnswerText() async {
        let vm = await chat(["0:\"Phần đầu\"", status("interrupted"), "d:{\"finishReason\":\"error\"}"])
        XCTAssertEqual(vm.endNotice, .interrupted)
        XCTAssertEqual(vm.messages.last?.content, "Phần đầu", "the status line is never appended to the answer")
        XCTAssertEqual(vm.messages.last?.status, .complete)

        let incomplete = await chat(["0:\"Phần đầu\"", status("incomplete"), "d:{\"finishReason\":\"length\"}"])
        XCTAssertEqual(incomplete.endNotice, .incomplete)
    }

    func testABodyThatClosedWithoutItsFinishFrameIsCut() async {
        let vm = await chat(["0:\"Nửa câu trả lời\""])
        XCTAssertEqual(vm.endNotice, .cut)
        XCTAssertEqual(vm.messages.last?.content, "Nửa câu trả lời", "the half answer stays")
        XCTAssertNil(vm.error)
    }

    func testAnErrorPartAfterSomeTextIsInterruptedNotSilent() async {
        let vm = await chat(["0:\"Nửa câu\"", "3:\"An error occurred.\"", "d:{\"finishReason\":\"error\"}"])
        XCTAssertEqual(vm.endNotice, .interrupted)
        XCTAssertEqual(vm.messages.last?.content, "Nửa câu")
    }

    func testTheServersStatusWinsOverTheCutHeuristic() async {
        let vm = await chat(["0:\"Phần đầu\"", status("incomplete")])
        XCTAssertEqual(vm.endNotice, .incomplete)
    }

    func testTheNoticeIsClearedWhenANewTurnStarts() async {
        let vm = await chat(["0:\"Nửa câu\""])
        XCTAssertEqual(vm.endNotice, .cut)
        vm.inputText = "Hỏi tiếp"
        vm.send()
        XCTAssertNil(vm.endNotice, "a new turn starts without the old notice")
        var waited = 0
        while vm.isStreaming, waited < 250 { try? await Task.sleep(nanoseconds: 20_000_000); waited += 1 }
    }

    func testEveryNoticeHasItsOwnLocalizedLine() {
        XCTAssertEqual(ChatEndNotice.cut.messageKey, "chat.streamCut")
        XCTAssertEqual(ChatEndNotice.incomplete.messageKey, "chat.turnIncomplete")
        XCTAssertEqual(ChatEndNotice.interrupted.messageKey, "chat.turnInterrupted")
    }
}

private struct ScriptedEndStateStreaming: StreamingClient {
    let lines: [String]
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { c in
            for line in lines { if let f = DataStreamLineParser.parse(line: line) { c.yield(f) } }
            c.finish()
        }
    }
}
