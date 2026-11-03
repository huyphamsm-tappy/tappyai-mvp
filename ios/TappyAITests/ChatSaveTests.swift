import XCTest
@testable import TappyAI

/// Saving the conversation (iOS audit bugs 1 and 2, the Android fa6f551 fix).
/// The save ran inside the turn's own Task, so (1) Stop cancelled it half way and the turn was never stored, and (2) two quick turns
/// ran two saves at once: two conversations were created, or an older PUT overwrote a newer one.
/// Now the save has its own Task, one save at a time, and the list is read when it is actually sent.
@MainActor
final class ChatSaveTests: XCTestCase {

    private let finishedReply = ["0:\"Trả lời\"", "d:{\"finishReason\":\"stop\"}"]

    private func signedInSession() -> SessionStore {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        session.didAuthenticate(TestFixtures.tokens(expiresIn: 3600), onboarded: true)
        return session
    }

    private func makeViewModel(api: ChatTestAPI, streaming: StreamingClient) -> ChatViewModel {
        ChatViewModel(service: ChatService(api: api, streaming: streaming), session: signedInSession())
    }

    private func ask(_ vm: ChatViewModel, _ text: String) async {
        vm.inputText = text
        vm.send()
        await waitUntil { !vm.isStreaming }
    }

    private func savedMessageCount(_ body: [String: Any]?) -> Int? {
        (body?["messages"] as? [[String: Any]])?.count
    }

    func testTheReplyIsFinishedBeforeTheSaveReturns() async {
        let gate = TestGate()
        let api = ChatTestAPI { endpoint in
            if endpoint.method == .post { await gate.wait() }
            return ChatTestJSON.savedConversation(id: "c1")
        }
        let vm = makeViewModel(api: api, streaming: ScriptedChatStreaming(lines: finishedReply))
        await ask(vm, "Một")
        await waitUntil { api.bodies(path: "/api/conversations", method: .post).count == 1 }

        XCTAssertFalse(vm.isStreaming, "the Stop button and the locked input end when the message is built, not when the save returns")
        XCTAssertEqual(vm.messages.last?.status, .complete)
        XCTAssertNil(vm.conversationId, "the save is still in flight")
        await gate.open()
        await waitUntil { vm.conversationId == "c1" }
        XCTAssertEqual(vm.conversationId, "c1")
    }

    func testStopDuringTheSaveDoesNotCancelIt() async {
        let gate = TestGate()
        let api = ChatTestAPI { endpoint in
            if endpoint.method == .post {
                await gate.wait()
                try Task.checkCancellation()   // what URLSession does to a request whose task was cancelled
            }
            return ChatTestJSON.savedConversation(id: "c1")
        }
        let vm = makeViewModel(api: api, streaming: ScriptedChatStreaming(lines: finishedReply))
        await ask(vm, "Một")
        await waitUntil { api.bodies(path: "/api/conversations", method: .post).count == 1 }

        vm.stop()
        await gate.open()
        await waitUntil { vm.conversationId == "c1" }
        XCTAssertEqual(vm.conversationId, "c1", "the save is not the turn's work: Stop must not cancel it")
    }

    func testTwoQuickTurnsSaveOneAfterTheOtherAsOneConversation() async {
        let gate = TestGate()
        let api = ChatTestAPI { endpoint in
            if endpoint.method == .post { await gate.wait() }
            return ChatTestJSON.savedConversation(id: "c1")
        }
        let vm = makeViewModel(api: api, streaming: ScriptedChatStreaming(lines: finishedReply))
        await ask(vm, "Một")
        await waitUntil { api.bodies(path: "/api/conversations", method: .post).count == 1 }
        await ask(vm, "Hai")   // the first save has not answered yet

        XCTAssertEqual(api.bodies(path: "/api/conversations", method: .post).count, 1,
                       "a second save must wait for the first, not create a second conversation")
        await gate.open()
        await waitUntil { api.bodies(path: "/api/conversations", method: .put).count == 1 }

        let puts = api.bodies(path: "/api/conversations", method: .put)
        XCTAssertEqual(puts.count, 1, "the turn that came meanwhile is saved by one PUT once the id is known")
        XCTAssertEqual(puts.first?["id"] as? String, "c1")
        XCTAssertEqual(savedMessageCount(puts.first), 4, "the list is read when the save is sent: both turns")
        XCTAssertEqual(api.bodies(path: "/api/conversations", method: .post).count, 1)
    }

    func testAStoppedReplyIsSavedWithWhatWasShown() async {
        let gate = TestGate()
        let api = ChatTestAPI { _ in ChatTestJSON.savedConversation(id: "c1") }
        let vm = makeViewModel(api: api, streaming: GatedChatStreaming(lines: ["0:\"Nửa câu\""], gate: gate))
        vm.inputText = "Một"
        vm.send()
        await waitUntil { vm.messages.last?.content == "Nửa câu" }

        vm.stop()
        await waitUntil { api.bodies(path: "/api/conversations", method: .post).count == 1 }
        XCTAssertEqual(vm.messages.last?.status, .complete)
        XCTAssertEqual(savedMessageCount(api.bodies(path: "/api/conversations", method: .post).first), 2,
                       "the question and the part of the answer that was shown")
        await gate.open()
    }
}

/// Yields `lines`, then stays open until `gate` opens (so a test can stop the turn mid-reply).
private struct GatedChatStreaming: StreamingClient {
    let lines: [String]
    let gate: TestGate
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { c in
            for line in lines { for f in DataStreamLineParser.frames(line: line) { c.yield(f) } }
            let waiter = Task {
                await gate.wait()
                c.finish()
            }
            c.onTermination = { _ in waiter.cancel() }
        }
    }
}
