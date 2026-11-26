import XCTest
@testable import TappyAI

/// UAT 26/11 (question «Tiểu sử elon»): the answer stopped in the middle of a word, «Dừng» stayed lit, and only quitting the app helped. The server
/// had finished and stored the whole answer. These pin what the phone does when the stream is cut, goes silent, or ends with a line that is not a frame.
@MainActor
final class ChatStreamRecoveryTests: XCTestCase {

    // MARK: - Frames the transport meets

    func testALineThatIsNotAFrameGivesNoFrame() {
        // The server may write a plain JSON line after `d:`; it must neither be a frame nor break the turn.
        XCTAssertTrue(DataStreamLineParser.frames(line: "{\"projects\":[{\"id\":\"p1\"}]}").isEmpty
                      || DataStreamLineParser.frames(line: "{\"projects\":[{\"id\":\"p1\"}]}").allSatisfy {
                          if case .unknown = $0 { return true } else { return false }
                      })
    }

    func testAVeryLongToolResultLineIsOneFrame() {
        let payload = String(repeating: "x", count: 18_000)
        let frames = DataStreamLineParser.frames(line: "a:{\"toolCallId\":\"t1\",\"result\":\"\(payload)\"}")
        XCTAssertEqual(frames.count, 1)
        guard case .toolResult(let data)? = frames.first else { return XCTFail("a long a: line is a tool result") }
        XCTAssertGreaterThan(data.count, 18_000)
    }

    func testMultiByteTextSurvivesAFrame() {
        let line = "0:\"Năm 1971, ông sinh ở Pretoria — Nam Phi 🚀\""
        XCTAssertEqual(DataStreamLineParser.frames(line: line), [.text("Năm 1971, ông sinh ở Pretoria — Nam Phi 🚀")])
    }

    // MARK: - The watchdog's clock

    func testSilenceBeforeTheFirstWordIsNotAStall() {
        let activity = StreamActivity()
        let start = Date()
        activity.touch(now: start)
        XCTAssertFalse(activity.markStalledIfSilent(longerThan: 25, now: start.addingTimeInterval(120)),
                       "the wait before the first word has its own, longer limit")
        XCTAssertFalse(activity.isStalled)
    }

    func testThirtySecondsOfSilenceAfterTheFirstWordsIsAStall() {
        let activity = StreamActivity()
        let start = Date()
        activity.touch(now: start)
        activity.textBegan()
        XCTAssertFalse(activity.markStalledIfSilent(longerThan: 25, now: start.addingTimeInterval(24)))
        XCTAssertTrue(activity.markStalledIfSilent(longerThan: 25, now: start.addingTimeInterval(30)))
        XCTAssertTrue(activity.isStalled)
        XCTAssertFalse(activity.markStalledIfSilent(longerThan: 25, now: start.addingTimeInterval(60)), "it is reported once")
    }

    func testABytesArrivingKeepsTheStreamAlive() {
        let activity = StreamActivity()
        let start = Date()
        activity.touch(now: start)
        activity.textBegan()
        activity.touch(now: start.addingTimeInterval(20))
        XCTAssertFalse(activity.markStalledIfSilent(longerThan: 25, now: start.addingTimeInterval(40)))
    }

    // MARK: - What counts as a lost connection

    func testConnectionDrops() {
        XCTAssertTrue(ChatViewModel.isConnectionDrop(AppError.offline))
        XCTAssertTrue(ChatViewModel.isConnectionDrop(AppError.streaming(reason: "timeout")))
        XCTAssertTrue(ChatViewModel.isConnectionDrop(AppError.network(status: nil, code: StreamWatchdog.stalledCode)))
        XCTAssertFalse(ChatViewModel.isConnectionDrop(AppError.network(status: 500, code: nil)))
        XCTAssertFalse(ChatViewModel.isConnectionDrop(AppError.authentication(reason: .unauthenticated)))
        XCTAssertFalse(ChatViewModel.isConnectionDrop(AppError.validation(message: "x")))
    }

    // MARK: - The turn when the stream is cut

    private func chat(lines: [String], thenFailWith error: Error?) async -> ChatViewModel {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        let vm = ChatViewModel(service: ChatService(api: MockAPIClient(), streaming: DroppingStreaming(lines: lines, error: error)), session: session)
        vm.inputText = "Tiểu sử elon"
        vm.send()
        var waited = 0
        while vm.isStreaming, waited < 250 { try? await Task.sleep(nanoseconds: 20_000_000); waited += 1 }
        return vm
    }

    func testAConnectionLostMidAnswerKeepsTheTextAndFreesTheWritingArea() async {
        let vm = await chat(lines: ["0:\"Elon Musk sinh năm 1971. Năm 199\""], thenFailWith: AppError.offline)
        XCTAssertFalse(vm.isStreaming, "«Dừng» goes back to «Gửi»")
        XCTAssertNil(vm.error, "the text on screen is kept, with no blocking error")
        XCTAssertEqual(vm.endNotice, .connectionLost)
        XCTAssertEqual(vm.messages.last?.content, "Elon Musk sinh năm 1971. Năm 199")
        XCTAssertEqual(vm.messages.last?.status, .complete)
    }

    func testAStreamEndedByTheWatchdogIsTheSameAsALostConnection() async {
        let vm = await chat(lines: ["0:\"Một phần câu trả lời\""],
                            thenFailWith: AppError.network(status: nil, code: StreamWatchdog.stalledCode))
        XCTAssertFalse(vm.isStreaming)
        XCTAssertEqual(vm.endNotice, .connectionLost)
        XCTAssertEqual(vm.messages.last?.content, "Một phần câu trả lời")
    }

    func testATimeoutBeforeAnyTextIsAnErrorAndLeavesNoEmptyBubble() async {
        let vm = await chat(lines: [], thenFailWith: AppError.streaming(reason: "timeout"))
        XCTAssertFalse(vm.isStreaming, "the writing area is free")
        XCTAssertNotNil(vm.error)
        XCTAssertFalse(vm.messages.contains { $0.isAssistant })
    }

    func testAStreamThatEndsWithAnOddLineAfterDoneIsAnOrdinaryReply() async {
        let vm = await chat(lines: ["0:\"Xin chào\"", "d:{\"finishReason\":\"stop\"}", "{\"projects\":[]}"], thenFailWith: nil)
        XCTAssertFalse(vm.isStreaming)
        XCTAssertNil(vm.error)
        XCTAssertNil(vm.endNotice)
        XCTAssertEqual(vm.messages.last?.content, "Xin chào")
    }

    func testTheLostConnectionNoticeIsRecoverable() {
        XCTAssertTrue(ChatEndNotice.connectionLost.isRecoverable)
        XCTAssertTrue(ChatEndNotice.cut.isRecoverable)
        XCTAssertFalse(ChatEndNotice.interrupted.isRecoverable)
        XCTAssertEqual(ChatEndNotice.connectionLost.messageKey, "chat.streamLost")
    }
}

/// A stream that yields the frames of `lines`, then ends: with `error` (a drop mid-answer) or cleanly.
private struct DroppingStreaming: StreamingClient {
    let lines: [String]
    let error: Error?
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { c in
            for line in lines {
                for frame in DataStreamLineParser.frames(line: line) {
                    // a line that is not a frame is skipped, exactly as the transport does
                    if case .unknown(let prefix, _) = frame, prefix != "3" { continue }
                    c.yield(frame)
                }
            }
            if let error { c.finish(throwing: error) } else { c.finish() }
        }
    }
}
