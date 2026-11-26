import XCTest
@testable import TappyAI

/// UAT 26/11 («Tiểu sử elon»): the answer stopped at «Năm 199». These drive the REAL `URLSessionStreamingClient` (not the scripted fakes) through a
/// URL protocol that delivers the body the way a phone's network does: in small chunks that split multi-byte characters, a line of 18,000
/// characters, a plain JSON line after `d:`, and a connection that goes silent. The question each one answers is «does the transport lose,
/// garble or hang on this?».
@MainActor
final class ChatStreamTransportTests: XCTestCase {

    private let endpoint = Endpoint(path: "/api/chat", method: .post, body: Data("{}".utf8), requiresAuth: false, timeout: 30)
    private var savedIdle: TimeInterval = 25

    override func setUp() {
        super.setUp()
        savedIdle = StreamWatchdog.idleAfterText
    }

    override func tearDown() {
        StreamWatchdog.idleAfterText = savedIdle
        ChunkedStreamProtocol.reset()
        super.tearDown()
    }

    private func makeClient() -> URLSessionStreamingClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ChunkedStreamProtocol.self]
        let session = SessionStore(storage: InMemoryTokenStorage())
        let consent = AIConsentStore(defaults: UserDefaults(suiteName: "ChatStreamTransportTests-\(UUID().uuidString)")!, enforced: false)
        return URLSessionStreamingClient(baseURL: URL(string: "http://localhost")!,
                                         auth: AuthInterceptor(provider: SessionAuthProvider(session: session)),
                                         session: URLSession(configuration: configuration),
                                         consent: consent)
    }

    /// Reads the stream to its end, or fails the test when it has not ended after `seconds` (a hang must fail, never wait forever).
    private func collect(_ client: URLSessionStreamingClient, within seconds: Double,
                         file: StaticString = #filePath, line: UInt = #line) async -> (frames: [StreamFrame], error: Error?, ended: Bool, took: Double) {
        let started = Date()
        let box = CollectBox()
        let reader = Task {
            do {
                for try await frame in client.stream(endpoint) { box.add(frame) }
            } catch { box.fail(error) }
            box.finish()
        }
        let deadline = Date().addingTimeInterval(seconds)
        while !box.isFinished, Date() < deadline { try? await Task.sleep(nanoseconds: 50_000_000) }
        let ended = box.isFinished
        if !ended { reader.cancel() }
        let snapshot = box.snapshot()
        return (snapshot.frames, snapshot.error, ended, Date().timeIntervalSince(started))
    }

    private let vietnamese = "Elon Musk sinh năm 1971 tại Pretoria, Nam Phi. Năm 1995 ông thành lập Zip2; năm 1999 ông lập X.com. 🚀 Ông đồng sáng lập PayPal, Tesla, SpaceX và Neuralink — những công ty định hình lại ngành."

    private func textLine(_ s: String) -> String {
        let data = try! JSONEncoder().encode(s)
        return "0:" + String(data: data, encoding: .utf8)!
    }

    func testChunksThatSplitMultiByteCharactersAndALongLineArriveWhole() async {
        var lines: [String] = ["f:{\"messageId\":\"m1\"}"]
        var expected = ""
        for i in 0..<120 {
            let piece = "[\(i)] " + vietnamese + "\n"
            expected += piece
            lines.append(textLine(piece))
        }
        lines.append("a:{\"toolCallId\":\"t\",\"result\":\"\(String(repeating: "x", count: 18_000))\"}")
        lines.append("e:{\"finishReason\":\"stop\"}")
        lines.append("d:{\"finishReason\":\"stop\"}")
        lines.append("{\"projects\":[{\"id\":\"p1\",\"name\":\"Dự án\"}]}")   // a plain JSON line after the finish frame
        ChunkedStreamProtocol.body = Data((lines.joined(separator: "\n") + "\n").utf8)
        ChunkedStreamProtocol.chunkSize = 7          // splits every multi-byte character somewhere
        ChunkedStreamProtocol.holdOpen = false

        let result = await collect(makeClient(), within: 20)
        XCTAssertTrue(result.ended, "the stream must end")
        XCTAssertNil(result.error)
        let text = result.frames.compactMap { frame -> String? in if case .text(let s) = frame { return s } else { return nil } }.joined()
        XCTAssertEqual(text, expected, "no word lost, none garbled, whatever way the chunks fall")
        XCTAssertTrue(result.frames.contains(.done))
    }

    func testAPlainJsonLineWithoutDoneIsSkippedAndTheStreamEndsClean() async {
        let lines = ["0:\"Xin chào\"", "{\"projects\":[]}", "0:\" bạn\""]
        ChunkedStreamProtocol.body = Data((lines.joined(separator: "\n") + "\n").utf8)
        ChunkedStreamProtocol.chunkSize = 5
        ChunkedStreamProtocol.holdOpen = false

        let result = await collect(makeClient(), within: 10)
        XCTAssertTrue(result.ended)
        XCTAssertNil(result.error)
        let text = result.frames.compactMap { frame -> String? in if case .text(let s) = frame { return s } else { return nil } }.joined()
        XCTAssertEqual(text, "Xin chào bạn", "the odd line is not text and does not stop the stream")
    }

    func testASilentConnectionAfterSomeTextEndsAsStalledAndKeepsWhatArrived() async {
        StreamWatchdog.idleAfterText = 1
        ChunkedStreamProtocol.body = Data(("f:{\"messageId\":\"m\"}\n" + textLine("Năm 199") + "\n").utf8)
        ChunkedStreamProtocol.chunkSize = 64
        ChunkedStreamProtocol.holdOpen = true       // the connection stays open and says nothing more

        let result = await collect(makeClient(), within: 12)
        XCTAssertTrue(result.ended, "a silent stream must end by itself — this is the hang the owner met")
        XCTAssertEqual(result.error as? AppError, .network(status: nil, code: StreamWatchdog.stalledCode))
        XCTAssertTrue(result.frames.contains(.text("Năm 199")), "the words that arrived are delivered before the end")
        XCTAssertLessThan(result.took, 10)
    }

    func testSilenceBeforeTheFirstWordIsLeftToTheRequestTimeout() async {
        StreamWatchdog.idleAfterText = 1
        ChunkedStreamProtocol.body = Data("f:{\"messageId\":\"m\"}\n".utf8)
        ChunkedStreamProtocol.chunkSize = 64
        ChunkedStreamProtocol.holdOpen = true

        let result = await collect(makeClient(), within: 4)
        XCTAssertFalse(result.ended, "no word has arrived, so the 25 s rule does not apply (a thinking step can be quiet)")
    }
}

/// What the collector saw; read by the test while the reader task writes.
private final class CollectBox: @unchecked Sendable {
    private let lock = NSLock()
    private var frames: [StreamFrame] = []
    private var error: Error?
    private var finished = false

    func add(_ frame: StreamFrame) { lock.lock(); frames.append(frame); lock.unlock() }
    func fail(_ error: Error) { lock.lock(); self.error = error; lock.unlock() }
    func finish() { lock.lock(); finished = true; lock.unlock() }
    var isFinished: Bool { lock.lock(); defer { lock.unlock() }; return finished }
    func snapshot() -> (frames: [StreamFrame], error: Error?) { lock.lock(); defer { lock.unlock() }; return (frames, error) }
}

/// Delivers `body` in `chunkSize`-byte pieces, then either closes the connection or leaves it open and silent (`holdOpen`).
private final class ChunkedStreamProtocol: URLProtocol {
    static var body = Data()
    static var chunkSize = 16
    static var holdOpen = false

    static func reset() {
        body = Data()
        chunkSize = 16
        holdOpen = false
    }

    private let lock = NSLock()
    private var stopped = false
    private var isStopped: Bool { lock.lock(); defer { lock.unlock() }; return stopped }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url ?? URL(string: "http://localhost")!
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "text/event-stream"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        let body = Self.body, size = max(Self.chunkSize, 1), hold = Self.holdOpen
        DispatchQueue.global().async { [self] in
            var offset = 0
            while offset < body.count {
                if isStopped { return }
                let end = min(offset + size, body.count)
                client?.urlProtocol(self, didLoad: body.subdata(in: offset..<end))
                offset = end
            }
            if !hold && !isStopped { client?.urlProtocolDidFinishLoading(self) }
        }
    }

    override func stopLoading() {
        lock.lock(); stopped = true; lock.unlock()
    }
}
