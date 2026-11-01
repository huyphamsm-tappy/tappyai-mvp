import XCTest
@testable import TappyAI

/// Polls `condition` every 20 ms for up to `ticks` ticks (5 s by default) on the main actor.
/// A free function, not a member of XCTestCase: CommentFlowTests has its own private `waitUntil`, and a second one on every test case
/// made its calls ambiguous.
@MainActor
func waitUntil(ticks: Int = 250, _ condition: @escaping () -> Bool) async {
    var waited = 0
    while !condition(), waited < ticks {
        try? await Task.sleep(nanoseconds: 20_000_000)
        waited += 1
    }
}

/// Doubles for the chat view model tests that need to control WHEN a network call answers
/// (history load, conversation save, stream). Nothing here touches the network or the clock.

/// One-shot gate: `wait()` suspends until `open()` is called; after that it returns at once.
actor TestGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            waiters.append(continuation)
        }
    }

    func open() {
        isOpen = true
        let pending = waiters
        waiters.removeAll()
        for waiter in pending { waiter.resume() }
    }
}

/// An `APIClient` whose answer to every endpoint comes from `handler`, and which remembers what was sent.
final class ChatTestAPI: APIClient, @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [Endpoint] = []
    private let handler: @Sendable (Endpoint) async throws -> Data

    init(handler: @escaping @Sendable (Endpoint) async throws -> Data = { _ in Data("{}".utf8) }) {
        self.handler = handler
    }

    var sentEndpoints: [Endpoint] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }

    /// The decoded JSON body of every request sent to `path` with `method`, in order.
    func bodies(path: String, method: HTTPMethod) -> [[String: Any]] {
        sentEndpoints
            .filter { $0.path == path && $0.method == method }
            .compactMap { endpoint -> [String: Any]? in
                guard let body = endpoint.body else { return nil }
                return (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
            }
    }

    func send(_ endpoint: Endpoint) async throws -> Data {
        lock.lock()
        recorded.append(endpoint)
        lock.unlock()
        return try await handler(endpoint)
    }

    func send<T: Decodable>(_ endpoint: Endpoint, as type: T.Type) async throws -> T {
        let data = try await send(endpoint)
        return try ResponseDecoder.json.decode(T.self, from: data)
    }
}

/// Feeds the chat view model a fixed list of data-stream lines, then ends.
struct ScriptedChatStreaming: StreamingClient {
    let lines: [String]
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { c in
            for line in lines { if let f = DataStreamLineParser.parse(line: line) { c.yield(f) } }
            c.finish()
        }
    }
}

/// One stream per call, in order: each yields its `lines`, then ends (with `error` when one is given). `holdBefore` delays the first
/// frame and `holdAfter` the end until the gate opens. It remembers every request, so a test can read what was sent.
final class SequencedChatStreaming: StreamingClient, @unchecked Sendable {
    struct Script: Sendable {
        var lines: [String] = []
        var error: Error? = nil
        var holdBefore: TestGate? = nil
        var holdAfter: TestGate? = nil
    }

    private let lock = NSLock()
    private var scripts: [Script]
    private var requests: [Endpoint] = []

    init(_ scripts: [Script]) {
        self.scripts = scripts
    }

    var sentEndpoints: [Endpoint] {
        lock.lock()
        defer { lock.unlock() }
        return requests
    }

    /// The `messages` array of the nth request, as `(role, content)` pairs.
    func sentMessages(at index: Int) -> [(role: String, content: String)] {
        let endpoints = sentEndpoints
        guard endpoints.indices.contains(index), let body = endpoints[index].body,
              let object = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
              let rows = object["messages"] as? [[String: Any]] else { return [] }
        return rows.map { (role: ($0["role"] as? String) ?? "", content: ($0["content"] as? String) ?? "") }
    }

    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        lock.lock()
        let script = scripts.isEmpty ? Script() : scripts.removeFirst()
        requests.append(endpoint)
        lock.unlock()
        return AsyncThrowingStream { c in
            let worker = Task {
                if let gate = script.holdBefore { await gate.wait() }
                for line in script.lines { if let f = DataStreamLineParser.parse(line: line) { c.yield(f) } }
                if let gate = script.holdAfter { await gate.wait() }
                if let error = script.error { c.finish(throwing: error) } else { c.finish() }
            }
            c.onTermination = { _ in worker.cancel() }
        }
    }
}

/// A stream that fails before any frame with `error`.
struct FailingChatStreaming: StreamingClient {
    let error: Error
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { $0.finish(throwing: error) }
    }
}

enum ChatTestJSON {
    /// The `GET /api/conversations` answer for one stored conversation.
    static func conversations(id: String, messages: [(role: String, content: String)]) -> Data {
        let rows = messages.map { "{\"role\":\"\($0.role)\",\"content\":\"\($0.content)\"}" }.joined(separator: ",")
        return Data("[{\"id\":\"\(id)\",\"title\":\"t\",\"category\":\"general\",\"messages\":[\(rows)]}]".utf8)
    }

    /// The `POST /api/conversations` answer: the row the server made.
    static func savedConversation(id: String) -> Data {
        Data("{\"id\":\"\(id)\",\"title\":\"t\",\"category\":\"general\",\"messages\":[]}".utf8)
    }
}
