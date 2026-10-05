import XCTest
@testable import TappyAI

/// UAT build 123: the person sent a message and Tappy never answered, with no error. A stream that ended without text (an
/// empty body, or only the AI SDK `3:` error part) finished as an empty "complete" reply. It must be a visible, retriable failure.
@MainActor
final class ChatSilentFailureTests: XCTestCase {

    private func chat(_ lines: [String]) async -> ChatViewModel {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        let vm = ChatViewModel(service: ChatService(api: MockAPIClient(), streaming: ScriptedStreaming(lines: lines)), session: session)
        vm.inputText = "Hôm nay tự thưởng một cái gì đó đi"
        vm.send()
        var waited = 0
        while vm.isStreaming, waited < 250 { try? await Task.sleep(nanoseconds: 20_000_000); waited += 1 }   // up to 5 s
        return vm
    }

    func testTheAiSdkErrorPartIsParsedAsAnUnknownFrameWeNowHandle() {
        guard case let .unknown(prefix, _)? = DataStreamLineParser.parse(line: "3:\"An error occurred.\"") else {
            return XCTFail("the 3: part is not one of the handled prefixes")
        }
        XCTAssertEqual(prefix, "3")
    }

    func testAnErrorOnlyStreamShowsAnErrorAndNoEmptyReply() async {
        let vm = await chat(["3:\"An error occurred.\"", "d:{\"finishReason\":\"error\"}"])
        XCTAssertEqual(vm.error, .generic, "the person is told it failed, with a retry")
        XCTAssertFalse(vm.messages.contains { $0.isAssistant }, "no empty assistant bubble is left behind")
        XCTAssertFalse(vm.isStreaming, "the next message can be sent")
    }

    func testAnEmptyStreamShowsAnError() async {
        let vm = await chat([])
        XCTAssertEqual(vm.error, .generic)
        XCTAssertFalse(vm.messages.contains { $0.isAssistant })
        XCTAssertFalse(vm.isStreaming)
    }

    func testAReplyThatIsOnlyAnUndecodableMarkerBlockIsAnError() async {
        // Text frames arrived, but everything in them is a marker block that decodes to nothing the person can see.
        let vm = await chat(["0:\"[TAPPY_ASK]{not json}[/TAPPY_ASK]\"", "d:{\"finishReason\":\"stop\"}"])
        XCTAssertEqual(vm.error, .generic)
        XCTAssertFalse(vm.messages.contains { $0.isAssistant })
    }

    func testAMarkerOnlyReplyThatDecodesToACardIsStillAReply() async {
        let vm = await chat(["0:\"[TAPPY_ASK]{\\\"v\\\":1,\\\"questions\\\":[{\\\"id\\\":\\\"q1\\\",\\\"q\\\":\\\"Mấy người?\\\",\\\"options\\\":[\\\"1\\\",\\\"2\\\"]}]}[/TAPPY_ASK]\"", "d:{\"finishReason\":\"stop\"}"])
        XCTAssertNil(vm.error)
        XCTAssertEqual(vm.messages.last?.status, .complete)
    }

    func testANormalReplyIsUnchanged() async {
        let vm = await chat(["0:\"Xin \"", "0:\"chào\"", "d:{\"finishReason\":\"stop\"}"])
        XCTAssertNil(vm.error)
        XCTAssertEqual(vm.messages.last?.content, "Xin chào")
        XCTAssertEqual(vm.messages.last?.status, .complete)
    }

    func testWhatCountsAsNothing() {
        XCTAssertTrue(ChatViewModel.streamProducedNothing(content: "  \n", hasPlaces: false))
        XCTAssertFalse(ChatViewModel.streamProducedNothing(content: "", hasPlaces: true), "a place card alone is a reply")
        XCTAssertFalse(ChatViewModel.streamProducedNothing(content: "Chào", hasPlaces: false))
    }
}

/// Feeds the chat view model a fixed list of data-stream lines.
private struct ScriptedStreaming: StreamingClient {
    let lines: [String]
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { c in
            for line in lines { if let f = DataStreamLineParser.parse(line: line) { c.yield(f) } }
            c.finish()
        }
    }
}
