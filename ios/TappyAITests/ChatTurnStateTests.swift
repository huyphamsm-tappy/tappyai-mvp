import XCTest
@testable import TappyAI

/// The state of a turn in the chat view model (iOS audit bugs 4, 5, 6 and 7; Android 257c1ee).
///  · 4: «try again» after a half reply doubled the bubble and sent a history that ended with the assistant's half answer;
///  · 5: the reply bubble was found by a fixed index, so a history that arrived mid-stream (it goes in front) made the reply
///       write into another message;
///  · 6: a turn that was stopped (or replaced) still finished later and cleared the NEXT turn's streaming state;
///  · 7: while the AI-sharing sheet was up, a second send added a second question to the held turn.
@MainActor
final class ChatTurnStateTests: XCTestCase {

    private func guestSession() -> SessionStore {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        return session
    }

    private func makeViewModel(_ streaming: StreamingClient, api: APIClient = MockAPIClient(),
                               conversationId: String? = nil) -> ChatViewModel {
        ChatViewModel(service: ChatService(api: api, streaming: streaming), session: guestSession(),
                      conversationId: conversationId)
    }

    // MARK: 4 — retry

    func testRetryAfterAHalfReplyReplacesTheBubbleAndSendsAHistoryEndingWithTheQuestion() async {
        let streaming = SequencedChatStreaming([
            .init(lines: ["0:\"Nửa câu\""], error: AppError.streaming(reason: "cut")),
            .init(lines: ["0:\"Đủ câu\"", "d:{\"finishReason\":\"stop\"}"]),
        ])
        let vm = makeViewModel(streaming)
        vm.inputText = "Hỏi"
        vm.send()
        await waitUntil { !vm.isStreaming }
        XCTAssertEqual(vm.messages.last?.status, .failed, "the half reply stays, marked as failed")
        XCTAssertNotNil(vm.error)

        vm.retry()
        await waitUntil { !vm.isStreaming }

        XCTAssertEqual(vm.messages.map(\.content), ["Hỏi", "Đủ câu"], "one bubble, not two")
        XCTAssertEqual(vm.messages.last?.status, .complete)
        let sent = streaming.sentMessages(at: 1)
        XCTAssertEqual(sent.map(\.role), ["user"], "the history ends with the user's question, never with the failed half reply")
        XCTAssertEqual(sent.last?.content, "Hỏi")
    }

    // MARK: 5 — the bubble is found by id

    func testAHistoryThatArrivesMidStreamDoesNotMoveTheReplyIntoAnotherMessage() async {
        let loadGate = TestGate()
        let streamGate = TestGate()
        let api = ChatTestAPI { endpoint in
            if endpoint.method == .get {
                await loadGate.wait()
                return ChatTestJSON.conversations(id: "c1", messages: [("user", "Câu cũ"), ("assistant", "Trả lời cũ")])
            }
            return Data("{}".utf8)
        }
        let streaming = SequencedChatStreaming([
            .init(lines: ["0:\"Trả lời mới\"", "d:{\"finishReason\":\"stop\"}"], holdBefore: streamGate),
        ])
        let vm = makeViewModel(streaming, api: api, conversationId: "c1")
        let load = Task { @MainActor in await vm.loadConversation() }
        await waitUntil { !api.sentEndpoints.isEmpty }

        vm.inputText = "Câu mới"
        vm.send()                  // the reply bubble is created; no text has arrived yet
        await loadGate.open()
        await load.value           // the history goes in front: every index moved by two
        await streamGate.open()
        await waitUntil { !vm.isStreaming }

        XCTAssertEqual(vm.messages.map(\.content), ["Câu cũ", "Trả lời cũ", "Câu mới", "Trả lời mới"],
                       "the reply is written into ITS bubble, whatever moved in front of it")
        XCTAssertEqual(vm.messages.last?.status, .complete)
    }

    // MARK: 6 — a finished-late turn does not touch the next one

    func testAStoppedTurnDoesNotEndTheNextTurnsStreamingState() async {
        let firstGate = TestGate()
        let secondGate = TestGate()
        let streaming = SequencedChatStreaming([
            .init(lines: ["0:\"A\""], holdAfter: firstGate),
            .init(lines: ["0:\"B\""], holdAfter: secondGate),
        ])
        let vm = makeViewModel(streaming)
        vm.inputText = "q1"
        vm.send()
        await waitUntil { vm.messages.last?.content == "A" }
        vm.stop()

        vm.inputText = "q2"
        vm.send()
        await waitUntil { vm.messages.last?.content == "B" }
        try? await Task.sleep(nanoseconds: 150_000_000)   // the stopped turn's own task gets its chance to run its tail

        XCTAssertTrue(vm.isStreaming, "the second turn is still streaming: the first one's late end must not clear it")
        XCTAssertEqual(vm.messages.last?.status, .streaming)
        XCTAssertEqual(vm.messages.map(\.content), ["q1", "A", "q2", "B"])
        await secondGate.open()
        await firstGate.open()
        await waitUntil { !vm.isStreaming }
        XCTAssertEqual(vm.messages.last?.status, .complete)
    }

    // MARK: 7 — consent hold

    func testASecondSendWhileTheConsentSheetIsUpIsRefused() async {
        let store = AIConsentStore(defaults: UserDefaults(suiteName: "ChatTurnStateTests-\(UUID().uuidString)")!, enforced: true)
        let coordinator = AIConsentCoordinator(store: store)
        let vm = ChatViewModel(
            service: ChatService(api: MockAPIClient(), streaming: ScriptedChatStreaming(lines: [])),
            session: guestSession(), consent: coordinator)
        vm.inputText = "Một"
        vm.send()
        await waitUntil { coordinator.isPresenting }
        XCTAssertTrue(vm.isAwaitingConsent)

        vm.inputText = "Hai"
        vm.send()
        XCTAssertEqual(vm.messages.map(\.content), ["Một"], "the held turn does not collect a second question")
        XCTAssertEqual(vm.inputText, "Hai", "what was typed is kept, not swallowed")

        coordinator.later()
        await waitUntil { !vm.isAwaitingConsent && vm.messages.isEmpty }
        XCTAssertFalse(vm.isAwaitingConsent)
        XCTAssertTrue(vm.messages.isEmpty)
    }
}
