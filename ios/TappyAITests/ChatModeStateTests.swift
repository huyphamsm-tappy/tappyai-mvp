import XCTest
@testable import TappyAI

/// The chat mode in the view model (web `ChatInterface.tsx` `chatMode`; Android 86addc8, 5340e3b, 257c1ee):
/// the menu's choice is what the turn sends; Deep Research goes back to Auto when the stream OPENS (web `onResponse`), not when the
/// question is sent, so a request that is refused or never connects keeps it. The menu is the fixed Deep-only one (the app reads no plan).
@MainActor
final class ChatModeStateTests: XCTestCase {

    private func modeSession() -> SessionStore {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        return session
    }

    private func makeViewModel(_ streaming: StreamingClient) -> ChatViewModel {
        ChatViewModel(service: ChatService(api: MockAPIClient(), streaming: streaming), session: modeSession())
    }

    private func sentMode(_ streaming: SequencedChatStreaming, at index: Int) throws -> String? {
        let endpoints = streaming.sentEndpoints
        let body = try XCTUnwrap(endpoints[index].body)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        return object["mode"] as? String
    }

    private let okReply = ["0:\"Xong\"", "d:{\"finishReason\":\"stop\"}"]

    func testAConversationStartsInAutoWithTheDeepMenu() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        XCTAssertEqual(vm.mode, .auto)
        XCTAssertEqual(vm.menuModes, [.deep])
    }

    func testSelectingDeepThenTheSameAgainGoesBackToAuto() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.selectMode(.deep)
        XCTAssertEqual(vm.mode, .deep)
        vm.selectMode(.deep)
        XCTAssertEqual(vm.mode, .auto)
    }

    func testAModeThatIsNotInTheMenuIsIgnored() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.selectMode(.think)
        XCTAssertEqual(vm.mode, .auto)
    }

    func testClearModeGoesBackToAuto() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.selectMode(.deep)
        vm.clearMode()
        XCTAssertEqual(vm.mode, .auto)
    }

    func testTheTurnSendsTheChosenMode() async throws {
        let streaming = SequencedChatStreaming([.init(lines: okReply), .init(lines: okReply)])
        let vm = makeViewModel(streaming)
        vm.inputText = "Một"
        vm.send()
        await waitUntil { !vm.isStreaming && streaming.sentEndpoints.count == 1 }
        XCTAssertEqual(try sentMode(streaming, at: 0), "auto")

        vm.selectMode(.deep)
        vm.inputText = "Hai"
        vm.send()
        await waitUntil { !vm.isStreaming && streaming.sentEndpoints.count == 2 }
        XCTAssertEqual(try sentMode(streaming, at: 1), "deep")
    }

    func testDeepStaysWhileTheRequestHasNotOpenedAndGoesBackWhenItOpens() async {
        let gate = TestGate()
        let streaming = SequencedChatStreaming([.init(lines: okReply, holdBefore: gate)])
        let vm = makeViewModel(streaming)
        vm.selectMode(.deep)
        vm.inputText = "Nghiên cứu"
        vm.send()
        await waitUntil { streaming.sentEndpoints.count == 1 }
        XCTAssertEqual(vm.mode, .deep, "sent but no frame yet: still Deep")

        await gate.open()
        await waitUntil { !vm.isStreaming }
        XCTAssertEqual(vm.mode, .auto, "the stream opened: Deep was for that question")
    }

    func testARequestThatFailsBeforeAnyFrameKeepsDeep() async {
        let streaming = SequencedChatStreaming([.init(lines: [], error: AppError.streaming(reason: "refused"))])
        let vm = makeViewModel(streaming)
        vm.selectMode(.deep)
        vm.inputText = "Nghiên cứu"
        vm.send()
        await waitUntil { !vm.isStreaming && vm.error != nil }
        XCTAssertEqual(vm.mode, .deep)
    }

}
