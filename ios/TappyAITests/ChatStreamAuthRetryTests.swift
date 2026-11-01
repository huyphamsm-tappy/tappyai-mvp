import XCTest
@testable import TappyAI

/// A 401 on the chat stream refreshes the token once and reopens the stream (iOS audit bug 8; `URLSessionAPIClient` already does
/// this for plain requests). The stream client only read the 401 body and gave up, so an access token that expired during a
/// long reading pause turned the next question into «please sign in» although the refresh token was good.
@MainActor
final class ChatStreamAuthRetryTests: XCTestCase {

    private let chatEndpoint = Endpoint(path: "/api/chat", method: .post, body: Data("{}".utf8), requiresAuth: true, timeout: 5)
    private func makeClient(refreshedToken: String?) -> (URLSessionStreamingClient, StubAuthProvider) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let auth = StubAuthProvider(refreshedToken: refreshedToken)
        let consent = AIConsentStore(defaults: UserDefaults(suiteName: "ChatStreamAuthRetryTests-\(UUID().uuidString)")!, enforced: false)
        let client = URLSessionStreamingClient(baseURL: URL(string: "http://localhost")!,
                                               auth: AuthInterceptor(provider: auth),
                                               session: URLSession(configuration: configuration),
                                               consent: consent)
        StubURLProtocol.reset()
        return (client, auth)
    }

    private func collect(_ client: URLSessionStreamingClient) async -> (frames: [StreamFrame], error: Error?) {
        var frames: [StreamFrame] = []
        do {
            for try await frame in client.stream(chatEndpoint) { frames.append(frame) }
        } catch {
            return (frames, error)
        }
        return (frames, nil)
    }

    func testA401RefreshesTheTokenOnceAndReopensTheStream() async {
        let (client, auth) = makeClient(refreshedToken: "new")
        StubURLProtocol.handler = { request in
            request.value(forHTTPHeaderField: "Authorization") == "Bearer new" ? (200, goodStreamBody) : (401, Data("{}".utf8))
        }
        let result = await collect(client)
        XCTAssertNil(result.error)
        XCTAssertEqual(result.frames, [.text("Chào"), .done])
        XCTAssertEqual(auth.refreshCount, 1)
        XCTAssertEqual(StubURLProtocol.sentCount, 2, "the stream was opened a second time with the new token")
    }

    func testARefreshThatFailsEndsAsASignInProblemAfterOneAttempt() async {
        let (client, auth) = makeClient(refreshedToken: nil)
        StubURLProtocol.handler = { _ in (401, Data("{}".utf8)) }
        let result = await collect(client)
        XCTAssertEqual(result.error as? AppError, .authentication(reason: .unauthenticated))
        XCTAssertEqual(auth.refreshCount, 1)
        XCTAssertEqual(StubURLProtocol.sentCount, 1)
    }

    func testASecond401AfterTheRefreshIsNotRefreshedAgain() async {
        let (client, auth) = makeClient(refreshedToken: "new")
        StubURLProtocol.handler = { _ in (401, Data("{}".utf8)) }
        let result = await collect(client)
        XCTAssertEqual(result.error as? AppError, .authentication(reason: .unauthenticated))
        XCTAssertEqual(auth.refreshCount, 1, "refresh once, never in a loop")
        XCTAssertEqual(StubURLProtocol.sentCount, 2)
    }

    func testTheGuestLimitIsNotATokenProblemAndIsNotRefreshed() async {
        let (client, auth) = makeClient(refreshedToken: "new")
        StubURLProtocol.handler = { _ in (401, Data(#"{"error":"anon_limit_reached"}"#.utf8)) }
        let result = await collect(client)
        XCTAssertEqual(result.error as? AppError, .authentication(reason: .anonLimitReached))
        XCTAssertEqual(auth.refreshCount, 0)
        XCTAssertEqual(StubURLProtocol.sentCount, 1)
    }

    func testAnOrdinaryAnswerNeverTouchesTheRefresh() async {
        let (client, auth) = makeClient(refreshedToken: "new")
        StubURLProtocol.handler = { _ in (200, goodStreamBody) }
        let result = await collect(client)
        XCTAssertEqual(result.frames, [.text("Chào"), .done])
        XCTAssertEqual(auth.refreshCount, 0)
        XCTAssertEqual(StubURLProtocol.sentCount, 1)
    }
}

/// Two frames of a finished reply, as the server writes them (one `<prefix>:<json>` per line).
private let goodStreamBody = Data("0:\"Chào\"\nd:{\"finishReason\":\"stop\"}\n".utf8)

/// Always has the token "old"; a forced refresh answers `refreshedToken` (nil = the refresh failed) and is counted.
private final class StubAuthProvider: AuthProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var refreshes = 0
    private let refreshedToken: String?

    init(refreshedToken: String?) {
        self.refreshedToken = refreshedToken
    }

    var refreshCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return refreshes
    }

    func accessToken() async -> String? { "old" }

    func forceRefresh() async -> String? {
        lock.lock()
        refreshes += 1
        lock.unlock()
        return refreshedToken
    }
}

/// Answers every request from `handler` (status + body) without a network. Tests run one at a time, so the statics are safe.
private final class StubURLProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (Int, Data))?
    private static let lock = NSLock()
    private static var sent = 0

    static func reset() {
        lock.lock()
        sent = 0
        lock.unlock()
        handler = nil
    }

    static var sentCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return sent
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        Self.sent += 1
        Self.lock.unlock()
        let (status, body) = Self.handler?(request) ?? (500, Data())
        let url = request.url ?? URL(string: "http://localhost")!
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "text/event-stream"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
