import Foundation

/// One frame of the Vercel AI SDK data-stream line protocol (docs/ios/04 §chat).
/// Line shape: `<prefix>:<json>\n` — `f`=message-start `{messageId}`, `0`=text delta,
/// `9`=tool-call, `a`=tool-result, `e`=step-end, `d`=done.
enum StreamFrame: Equatable, Sendable {
    case messageStart(Data)
    case text(String)
    case toolCall(Data)
    case toolResult(Data)
    case stepEnd
    case done
    case unknown(prefix: String, payload: Data)
}

/// Pure, testable parser for a single already-framed line. The chunk→line buffering is handled by the
/// transport (`URLSession.AsyncBytes.lines`); higher-level marker extraction ([TAPPY_PLAN] etc.) is a
/// chat-feature concern (Phase 2), NOT part of the foundation.
enum DataStreamLineParser {
    static func parse(line: String) -> StreamFrame? {
        guard let sep = line.firstIndex(of: ":") else { return nil }
        let prefix = String(line[line.startIndex..<sep])
        let payloadString = String(line[line.index(after: sep)...])
        let payload = Data(payloadString.utf8)
        switch prefix {
        case "0":
            // JSON-encoded string delta.
            if let s = try? JSONDecoder().decode(String.self, from: payload) { return .text(s) }
            return .text(payloadString)
        case "f": return .messageStart(payload)
        case "9": return .toolCall(payload)
        case "a": return .toolResult(payload)
        case "e": return .stepEnd
        case "d": return .done
        default:  return .unknown(prefix: prefix, payload: payload)
        }
    }
}

protocol StreamingClient: Sendable {
    /// Streams frames for an endpoint. The stream ends on `.done`, error, or cancellation.
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error>
}

final class URLSessionStreamingClient: StreamingClient {
    private let builder: RequestBuilder
    private let session: URLSession
    private let auth: AuthInterceptor

    init(baseURL: URL, auth: AuthInterceptor, session: URLSession = .shared) {
        self.builder = RequestBuilder(baseURL: baseURL)
        self.session = session
        self.auth = auth
    }

    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try builder.makeRequest(endpoint)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    if endpoint.requiresAuth { await auth.authorize(&request) }
                    let (bytes, response) = try await session.bytes(for: request)
                    if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                        // Read the (small) JSON error body so backend error codes map to their
                        // specific UX — 429 free_limit_reached → "come back tomorrow",
                        // 401 anon_limit_reached → sign-in prompt (docs/ios/04 §2.1). Without
                        // this, every limit surfaced as a generic "streaming" failure. Bounded
                        // read: limit responses are tiny; cap guards a misbehaving server.
                        var body = Data()
                        for try await byte in bytes {
                            body.append(byte)
                            if body.count > 64 * 1024 { break }
                        }
                        throw URLSessionAPIClient.mapHTTP(status: http.statusCode, data: body)
                    }
                    for try await line in bytes.lines {
                        try Task.checkCancellation()
                        if line.isEmpty { continue }
                        if let frame = DataStreamLineParser.parse(line: line) {
                            continuation.yield(frame)
                            if frame == .done { break }
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: (error is CancellationError) ? AppError.cancellation
                                        : (error as? AppError) ?? URLSessionAPIClient.mapTransport(error))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
