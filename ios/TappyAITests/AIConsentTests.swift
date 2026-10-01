import XCTest
@testable import TappyAI

/// App Review 5.1.2(i): NO request that carries the person's content to the AI provider leaves the phone
/// before they have agreed — enforced by the screens and, independently, by the networking layer.
@MainActor
final class AIConsentTests: XCTestCase {

    private func store(enforced: Bool = true) -> AIConsentStore {
        AIConsentStore(defaults: UserDefaults(suiteName: "AIConsentTests-\(UUID().uuidString)")!, enforced: enforced)
    }

    // MARK: Store

    func testNothingIsGrantedByDefaultAndAIRoutesAreBlocked() {
        let s = store()
        XCTAssertFalse(s.isGranted)
        for path in ["/api/chat", "/api/translate", "/api/scan", "/api/viet-content", "/api/chat?x=1"] {
            XCTAssertTrue(s.blocks(path: path), path)
        }
    }

    func testNonAIRoutesAreNeverBlocked() {
        let s = store()
        for path in ["/api/rates", "/api/deals", "/api/scam-shield/check", "/api/config", "/api/conversations", "/api/reviews/feed"] {
            XCTAssertFalse(s.blocks(path: path), path)
        }
    }

    func testGrantAndWithdraw() {
        let s = store()
        s.grant()
        XCTAssertTrue(s.isGranted)
        XCTAssertFalse(s.blocks(path: "/api/chat"))
        s.withdraw()
        XCTAssertFalse(s.isGranted)
        XCTAssertTrue(s.blocks(path: "/api/chat"), "withdrawing blocks AI again")
    }

    func testAnUnenforcedStoreBlocksNothing() {
        XCTAssertFalse(store(enforced: false).blocks(path: "/api/chat"))
    }

    // MARK: Networking layer — nothing is even attempted

    private func client(_ s: AIConsentStore) -> URLSessionAPIClient {
        let session = SessionStore(storage: InMemoryTokenStorage())
        // Nothing listens here: if a request WERE attempted the error would be a network one, not the consent one.
        return URLSessionAPIClient(baseURL: URL(string: "http://127.0.0.1:1")!,
                                   auth: AuthInterceptor(provider: SessionAuthProvider(session: session)),
                                   consent: s)
    }

    func testTheAPIClientRefusesAnAIRequestBeforeConsent() async {
        let c = client(store())
        for path in ["/api/chat", "/api/translate", "/api/scan", "/api/viet-content"] {
            do {
                _ = try await c.send(Endpoint(path: path, method: .post, body: Data("{}".utf8)))
                XCTFail("\(path) must not be sent")
            } catch {
                XCTAssertEqual(error as? AppError, AIConsentStore.blockedError, path)
            }
        }
    }

    func testTheAPIClientStillSendsNonAIRequests() async {
        let c = client(store())
        do {
            _ = try await c.send(Endpoint(path: "/api/rates", method: .get))
            XCTFail("nothing listens on that port")
        } catch {
            XCTAssertNotEqual(error as? AppError, AIConsentStore.blockedError, "a non-AI route is not held back by consent")
        }
    }

    func testTheStreamingClientRefusesTheChatBeforeConsent() async {
        let session = SessionStore(storage: InMemoryTokenStorage())
        let s = URLSessionStreamingClient(baseURL: URL(string: "http://127.0.0.1:1")!,
                                          auth: AuthInterceptor(provider: SessionAuthProvider(session: session)),
                                          consent: store())
        var failure: Error?
        do {
            for try await _ in s.stream(Endpoint(path: "/api/chat", method: .post, body: Data("{}".utf8))) {}
        } catch { failure = error }
        XCTAssertEqual(failure as? AppError, AIConsentStore.blockedError)
    }

    // MARK: Coordinator

    func testAlreadyAgreedReturnsAtOnceWithoutTheSheet() async {
        let s = store(); s.grant()
        let c = AIConsentCoordinator(store: s)
        let ok = await c.ensure()
        XCTAssertTrue(ok)
        XCTAssertFalse(c.isPresenting)
    }

    func testNotNowSendsNothingAndRemembersNothing() async {
        let s = store()
        let c = AIConsentCoordinator(store: s)
        let task = Task { await c.ensure() }
        while !c.isPresenting { await Task.yield() }
        c.later()
        let ok = await task.value
        XCTAssertFalse(ok)
        XCTAssertFalse(s.isGranted)
        XCTAssertFalse(c.isPresenting)
    }

    func testAgreeingIsRememberedAndWithdrawable() async {
        let s = store()
        let c = AIConsentCoordinator(store: s)
        let task = Task { await c.ensure() }
        while !c.isPresenting { await Task.yield() }
        c.agree()
        XCTAssertTrue(await task.value)
        XCTAssertTrue(s.isGranted)
        XCTAssertTrue(c.granted)
        c.withdraw()
        XCTAssertFalse(s.isGranted)
        XCTAssertFalse(c.granted)
    }

    // MARK: A feature that asks first

    func testTranslateSendsNothingWhenThePersonSaysNotNow() async {
        let s = store()
        let c = AIConsentCoordinator(store: s)
        let api = MockAPIClient()
        let service = UtilityToolsService(api: api, consent: c)
        let task = Task { try await service.translate(text: "xin chao", targetLang: "en") }
        while !c.isPresenting { await Task.yield() }
        c.later()
        do { _ = try await task.value; XCTFail("must not translate") } catch {
            XCTAssertEqual(error as? AppError, AIConsentStore.blockedError)
        }
        XCTAssertTrue(api.sentEndpoints.isEmpty, "no request was made")
    }

    func testChatHoldsTheTurnForConsentAndGivesTheTextBackOnNotNow() async {
        let s = store()
        let c = AIConsentCoordinator(store: s)
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        let vm = ChatViewModel(service: ChatService(api: MockAPIClient(), streaming: ThrowingStreaming()), session: session, consent: c)
        vm.inputText = "Quan an ngon"
        vm.send()
        while !c.isPresenting { await Task.yield() }
        XCTAssertFalse(vm.isStreaming, "held before anything is sent")
        c.later()
        while vm.inputText.isEmpty { await Task.yield() }
        XCTAssertEqual(vm.inputText, "Quan an ngon")
        XCTAssertTrue(vm.messages.isEmpty)
    }
}

/// A streaming client that fails the test if the chat ever tries to stream.
private struct ThrowingStreaming: StreamingClient {
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { $0.finish(throwing: AppError.unexpected(message: "streamed without consent")) }
    }
}
