import XCTest
@testable import TappyAI

/// Reopening a conversation from history (iOS audit bug 3, the Android 45ac680 fix).
/// Saving a conversation is a PUT that replaces the whole message list. When the history failed to load, the chat fell back to an
/// empty screen but kept the conversation id, so the next reply REPLACED the stored conversation with the new messages only. And a
/// question sent while the history was still loading was overwritten when the history arrived.
@MainActor
final class ChatHistoryLoadTests: XCTestCase {

    private func signedInSession() -> SessionStore {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        session.didAuthenticate(TestFixtures.tokens(expiresIn: 3600), onboarded: true)
        return session
    }

    func testAHistoryThatFailsToLoadDropsTheConversationId() async {
        let api = ChatTestAPI { _ in throw AppError.offline }
        let vm = ChatViewModel(service: ChatService(api: api, streaming: ScriptedChatStreaming(lines: [])),
                               session: signedInSession(), conversationId: "c1")
        await vm.loadConversation()
        XCTAssertNil(vm.conversationId, "a failed load is a new chat: the next save must not replace conversation c1")
        XCTAssertNotNil(vm.error)
        XCTAssertFalse(vm.isLoadingConversation)
    }

    func testTheNextReplyAfterAFailedLoadIsSavedAsANewConversation() async {
        let api = ChatTestAPI { endpoint in
            if endpoint.method == .get { throw AppError.offline }
            return ChatTestJSON.savedConversation(id: "c2")
        }
        let vm = ChatViewModel(
            service: ChatService(api: api, streaming: ScriptedChatStreaming(lines: ["0:\"Chào\"", "d:{\"finishReason\":\"stop\"}"])),
            session: signedInSession(), conversationId: "c1")
        await vm.loadConversation()
        vm.inputText = "Hỏi tiếp"
        vm.send()
        await waitUntil { api.bodies(path: "/api/conversations", method: .post).count == 1 }
        XCTAssertTrue(api.bodies(path: "/api/conversations", method: .put).isEmpty,
                      "no PUT to the old conversation: it would replace its stored history")
        XCTAssertEqual(api.bodies(path: "/api/conversations", method: .post).count, 1)
    }

    func testTheHistoryGoesInFrontOfAQuestionSentWhileItLoaded() async {
        let gate = TestGate()
        let api = ChatTestAPI { endpoint in
            if endpoint.method == .get {
                await gate.wait()
                return ChatTestJSON.conversations(id: "c1", messages: [("user", "Câu cũ"), ("assistant", "Trả lời cũ")])
            }
            return Data("{}".utf8)
        }
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()   // a guest: nothing is saved in this test
        let vm = ChatViewModel(
            service: ChatService(api: api, streaming: ScriptedChatStreaming(lines: ["0:\"Trả lời mới\"", "d:{\"finishReason\":\"stop\"}"])),
            session: session, conversationId: "c1")
        let load = Task { @MainActor in await vm.loadConversation() }
        await waitUntil { !api.sentEndpoints.isEmpty }

        vm.inputText = "Câu mới"
        vm.send()
        await waitUntil { !vm.isStreaming && vm.messages.count == 2 }
        await gate.open()
        await load.value

        XCTAssertEqual(vm.messages.map(\.content), ["Câu cũ", "Trả lời cũ", "Câu mới", "Trả lời mới"],
                       "the loaded history goes first; what was sent while it loaded is kept after it")
        XCTAssertEqual(Set(vm.messages.map(\.id)).count, 4, "message ids stay unique after the merge")
    }
}
