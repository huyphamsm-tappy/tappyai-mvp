import Foundation

/// One frame of the Vercel AI SDK data-stream line protocol (docs/ios/04 §chat).
/// Line shape: `<prefix>:<json>\n` — `f`=message-start `{messageId}`, `0`=text delta,
/// `9`=tool-call, `a`=tool-result, `8`=message annotation, `e`=step-end, `d`=done.
enum StreamFrame: Equatable, Sendable {
    case messageStart(Data)
    case text(String)
    case toolCall(Data)
    case toolResult(Data)
    case stepEnd
    /// ADR-024. The `X-Decision-Evidence-Id` response header, surfaced as a frame so the caller can store it and
    /// echo it back on the conversation's next turn. A lookup KEY only, never the evidence facts.
    case decisionEvidenceId(String)
    /// The `x-tappy-deep-reset` response header (`DeepResetHeader`): the day the monthly Deep Research reports come back, sent when a report was
    /// asked for with none left and the server ran the question as Thinking. Shown as one fixed note; never part of the answer.
    case deepResetOn(String)
    /// A message ANNOTATION (`8:`) carrying the turn's live place decision.
    ///
    /// 🚨 THE STREAM WAS NEVER TEXT-ONLY — THIS FRAME WAS ARRIVING AND FALLING INTO `.unknown`.
    /// The server has sent the place decision here since web gained its place card; iOS parsed the
    /// line, classified it as unknown and dropped it, so the same reply produced a rich decision
    /// card in the browser and bare prose on the phone. Nothing about the server contract changes
    /// to read it — the frame was always there.
    case places(PlacesLiveView)
    /// The place decision of this turn is EMPTY (web `liveView.ts`, `cleared: true`): the place cards drawn earlier in the reply go.
    case placesCleared
    /// A message ANNOTATION (`8:`) of kind `tappy.turn_status.v1`: how the server says the turn ENDED when it
    /// did not end cleanly (C2 P2; web `readTurnStatus`). A status line under the reply, never answer text.
    case turnStatus(TurnStatusKind)
    /// A message ANNOTATION (`8:`) of kind `tappy.progress.v1`: what the pipeline is doing right now, as a
    /// sentence the server wrote in the turn's language (never the user's words). Shown in the thinking
    /// indicator; never text, never persisted. Web parity: `progressAnnotation.ts` `readProgress`.
    case progress(stage: String, text: String)
    /// A message ANNOTATION (`8:`) of type `tappy.research.v1`: the Deep Research card (plan, steps, source count, cited sources),
    /// re-checked by `OneBrainFrames.research`. The latest one is the card's state. Never text, never saved.
    case research(ResearchStatus)
    /// A message ANNOTATION (`8:`) of type `tappy.research_charts.v1`: the report's charts, from figures the server checked in
    /// their own source (`OneBrainFrames.charts`). Never text, never saved.
    case charts([ResearchChart])
    /// A message ANNOTATION (`8:`) of kind `tappy.doc_media.v1`: the pictures that go under the answer's headings
    /// (`OneBrainFrames.docMedia`). Live only; never text, never saved.
    case docMedia([DocMediaItem])
    /// A message ANNOTATION (`8:`) of kind `tappy.safety.v1`: the emergency hotlines the server verified, drawn as a card with a call button
    /// each (`EmergencyFrames.cards`). The same numbers are also in the reply's text. Live only; never text, never saved.
    case safety([EmergencyCardItem])
    /// A message ANNOTATION (`8:`) of kind `tappy.presentation.v1`: the blocks the model declared (comparison table, subject cards, gallery,
    /// tap-to-send questions, booking handoff), re-checked by `PresentationFrames`. The latest one is the answer's. Live only; never text, never saved.
    case presentation(PresentationFrame)
    /// A message ANNOTATION (`8:`) of kind `tappy.subject_images.v1`: pictures the server found for the subject cards and the gallery, by name
    /// (`SubjectImages.frame`). The latest one is the answer's. Live only; never text, never saved.
    case subjectImages(SubjectImagesFrame)
    case done
    case unknown(prefix: String, payload: Data)
}

/// The two end states `tappy.turn_status.v1` can carry; any other value is ignored by the reader.
enum TurnStatusKind: String, Equatable, Sendable {
    /// The answer stops early (cut after the one rescue, or the request budget / deadline ended it).
    case incomplete
    /// A server / provider error broke the answer while it was streaming; the part shown stays.
    case interrupted
}

/// ADR-024 response header and its validation. A lookup key, never a fact: non-empty, trimmed, short.
enum DecisionEvidenceHeader {
    static let name = "X-Decision-Evidence-Id"
    static func key(_ raw: String?) -> String? {
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return !trimmed.isEmpty && trimmed.count <= 64 ? trimmed : nil
    }
}

/// The `x-tappy-deep-reset` response header (server `src/lib/plans/deepResearchNotice.ts`): `yyyy-MM-dd`, the first day of next month in Vietnam.
/// Anything that is not that shape is ignored (the note says a date, so a stray value must not become one).
enum DeepResetHeader {
    static let name = "x-tappy-deep-reset"

    static func date(_ raw: String?) -> String? {
        let v = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard v.count == 10 else { return nil }
        let parts = v.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              parts.allSatisfy({ $0.utf8.allSatisfy { $0 >= 0x30 && $0 <= 0x39 } }),
              let month = Int(parts[1]), (1...12).contains(month), let day = Int(parts[2]), (1...31).contains(day)
        else { return nil }
        return v
    }

    /// `2026-12-01` → `01/12/2026` (day first, as the web's `displayResetDate`).
    static func displayDate(_ iso: String) -> String {
        let p = iso.split(separator: "-")
        return p.count == 3 ? "\(p[2])/\(p[1])/\(p[0])" : iso
    }
}

/// The turn-status annotation's `kind` (server `progressAnnotation.ts`).
let turnStatusAnnotationKind = "tappy.turn_status.v1"
/// The progress annotation's `kind` (server `progressAnnotation.ts`, A1(b)).
let progressAnnotationKind = "tappy.progress.v1"

/// Pure, testable parser for a single already-framed line. The chunk→line buffering is handled by the
/// transport (`URLSession.AsyncBytes.lines`); higher-level marker extraction ([TAPPY_PLAN] etc.) is a
/// chat-feature concern (Phase 2), NOT part of the foundation.
enum DataStreamLineParser {
    /// The FIRST frame of a line, or nil for a line that is not a frame. A line can carry several frames (an `8:` array holds
    /// one per annotation), so the stream reads `frames(line:)`; this stays for callers that want one.
    static func parse(line: String) -> StreamFrame? {
        frames(line: line).first
    }

    /// Every frame of one line, in order. Only an `8:` array can hold more than one: each element is an annotation, and each
    /// is read on its own, so one array that carries the progress sentence and the place set gives both. A line that is not a
    /// frame gives none.
    static func frames(line: String) -> [StreamFrame] {
        guard let sep = line.firstIndex(of: ":") else { return [] }
        let prefix = String(line[line.startIndex..<sep])
        let payloadString = String(line[line.index(after: sep)...])
        let payload = Data(payloadString.utf8)
        switch prefix {
        case "0":
            // JSON-encoded string delta.
            if let s = try? JSONDecoder().decode(String.self, from: payload) { return [.text(s)] }
            return [.text(payloadString)]
        case "f": return [.messageStart(payload)]
        case "8":
            // An element this version does not know (or one that is malformed) is skipped on its own; an array with
            // nothing usable in it stays one `.unknown` frame, so the line is carried and never breaks the turn.
            let found = annotationFrames(payload)
            return found.isEmpty ? [.unknown(prefix: prefix, payload: payload)] : found
        case "9": return [.toolCall(payload)]
        case "a": return [.toolResult(payload)]
        case "e": return [.stepEnd]
        case "d": return [.done]
        default:  return [.unknown(prefix: prefix, payload: payload)]
        }
    }

    /// The frames of one `8:` payload: one per usable element, in order. Each element is gated on its own tag: `kind`, or `type` for
    /// the research frames (`tappy.research.v1`, `tappy.research_charts.v1`), as the web writes them.
    private static func annotationFrames(_ payload: Data) -> [StreamFrame] {
        guard let elements = (try? JSONSerialization.jsonObject(with: payload)) as? [Any] else { return [] }
        return elements.compactMap { element -> StreamFrame? in
            guard let item = element as? [String: Any],
                  let kind = (item["kind"] as? String) ?? (item["type"] as? String) else { return nil }
            switch kind {
            case researchAnnotationType:
                guard let status = OneBrainFrames.research(item) else { return nil }
                return .research(status)
            case researchChartsAnnotationType:
                let charts = OneBrainFrames.charts(item)
                return charts.isEmpty ? nil : .charts(charts)
            case docMediaAnnotationKind:
                let items = OneBrainFrames.docMedia(item)
                return items.isEmpty ? nil : .docMedia(items)
            case safetyAnnotationKind:
                let cards = EmergencyFrames.cards(item)
                return cards.isEmpty ? nil : .safety(cards)
            case presentationAnnotationKind:
                return PresentationFrames.frame(item).map { .presentation($0) }
            case subjectImagesAnnotationKind:
                return SubjectImages.frame(item).map { .subjectImages($0) }
            case placesAnnotationKind:
                // An empty decision that says so: the server found no place for this reply, so nothing drawn earlier stays on screen.
                if (item["cleared"] as? Bool) == true { return .placesCleared }
                guard let data = try? JSONSerialization.data(withJSONObject: item),
                      let view = try? JSONDecoder().decode(PlacesLiveView.self, from: data),
                      !view.items.isEmpty else { return nil }
                return .places(view)
            case turnStatusAnnotationKind:
                // A status value this version does not know is ignored.
                guard let raw = item["status"] as? String, let status = TurnStatusKind(rawValue: raw) else { return nil }
                return .turnStatus(status)
            case progressAnnotationKind:
                // A blank text is not a frame.
                guard let text = (item["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                      !text.isEmpty else { return nil }
                return .progress(stage: (item["stage"] as? String) ?? "", text: text)
            default:
                return nil
            }
        }
    }
}

/// The silence a chat stream may have once its first words arrived (see `URLSessionStreamingClient.stream`).
enum StreamWatchdog {
    /// Seconds with no byte after the first text frame before the stream is ended as stalled.
    /// Mutable only so a test can shorten it; nothing else changes it.
    static var idleAfterText: TimeInterval = 25
    /// The `AppError.network` code of a stream the watchdog ended.
    static let stalledCode = "stream_stalled"
}

/// When bytes last arrived on one stream, what has come so far (counts and sizes only, never text), and whether the watchdog ended it. Read by
/// the watchdog task, written by the reader task.
final class StreamActivity: @unchecked Sendable {
    private let lock = NSLock()
    private let startedAt = Date()
    private var lastByteAt = Date()
    private var textStarted = false
    private var stalled = false
    private var lines = 0
    private var bytes = 0
    private var frames = 0
    private var longestLine = 0
    private var sawDone = false

    func touch(now: Date = Date()) {
        lock.lock(); lastByteAt = now; lock.unlock()
    }

    /// A line arrived: counted, and the stream is alive.
    func counted(line: String, now: Date = Date()) {
        let size = line.utf8.count + 1
        lock.lock()
        lastByteAt = now
        lines += 1
        bytes += size
        longestLine = max(longestLine, size)
        lock.unlock()
    }

    func countedFrame(_ frame: StreamFrame) {
        lock.lock()
        frames += 1
        if frame == .done { sawDone = true }
        lock.unlock()
    }

    /// One line for the diagnostics: what the stream has done so far.
    func summary(now: Date = Date()) -> String {
        lock.lock(); defer { lock.unlock() }
        return "lines=\(lines) bytes=\(bytes) frames=\(frames) longestLine=\(longestLine) text=\(textStarted) done=\(sawDone)"
            + " sinceLastByte=\(Int(now.timeIntervalSince(lastByteAt)))s elapsed=\(Int(now.timeIntervalSince(startedAt)))s"
    }

    func textBegan() {
        lock.lock(); textStarted = true; lock.unlock()
    }

    var isStalled: Bool {
        lock.lock(); defer { lock.unlock() }
        return stalled
    }

    /// True (once) when the first words have arrived and nothing has come for `limit` seconds: the stream is then marked stalled.
    func markStalledIfSilent(longerThan limit: TimeInterval, now: Date = Date()) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard textStarted, !stalled, now.timeIntervalSince(lastByteAt) >= limit else { return false }
        stalled = true
        return true
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
    private let consent: AIConsentStore

    init(baseURL: URL, auth: AuthInterceptor, session: URLSession = .shared, consent: AIConsentStore = .shared) {
        self.builder = RequestBuilder(baseURL: baseURL)
        self.session = session
        self.auth = auth
        self.consent = consent
    }

    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
        AsyncThrowingStream { continuation in
            // Once the first words have arrived the server writes without long pauses, so a silent stream is a lost connection: the
            // watchdog below ends it (the request's own 130 s silence limit is for the wait BEFORE the first word).
            let activity = StreamActivity()
            let task = Task {
                do {
                    // App Review 5.1.2(i): no AI request leaves the phone before the person has agreed.
                    if consent.blocks(path: endpoint.path) { throw AIConsentStore.blockedError }
                    var request = try builder.makeRequest(endpoint)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    if endpoint.requiresAuth { await auth.authorize(&request) }
                    let (bytes, response) = try await openRefreshingOnce(request, requiresAuth: endpoint.requiresAuth)
                    // ADR-024: surface the decision-evidence key BEFORE the body streams, so the ViewModel has it stored
                    // by the time the next turn is sent. A header the server does not set yields no frame.
                    if let http = response as? HTTPURLResponse,
                       let key = DecisionEvidenceHeader.key(http.value(forHTTPHeaderField: DecisionEvidenceHeader.name)) {
                        continuation.yield(.decisionEvidenceId(key))
                    }
                    if let http = response as? HTTPURLResponse,
                       let date = DeepResetHeader.date(http.value(forHTTPHeaderField: DeepResetHeader.name)) {
                        continuation.yield(.deepResetOn(date))
                    }
                    DiagnosticSnapshot.shared.record("chat stream open")
                    for try await line in bytes.lines {
                        try Task.checkCancellation()
                        activity.counted(line: line)
                        if line.isEmpty { continue }
                        var finished = false
                        // A line that is not a frame (the JSON line the server may write after `d:`) gives no frame and is skipped.
                        for frame in DataStreamLineParser.frames(line: line) {
                            if case .text = frame { activity.textBegan() }
                            activity.countedFrame(frame)
                            continuation.yield(frame)
                            if frame == .done { finished = true }
                        }
                        if finished { break }
                    }
                    DiagnosticSnapshot.shared.record("chat stream finished \(activity.summary())")
                    continuation.finish()
                } catch {
                    let ns = error as NSError
                    DiagnosticSnapshot.shared.record("chat stream error \(ns.domain)#\(ns.code) \(activity.summary())", isError: true)
                    if activity.isStalled {
                        continuation.finish(throwing: AppError.network(status: nil, code: StreamWatchdog.stalledCode))
                    } else {
                        continuation.finish(throwing: (error is CancellationError) ? AppError.cancellation
                                            : (error as? AppError) ?? URLSessionAPIClient.mapStreamTransport(error))
                    }
                }
            }
            // The watchdog: every second, is the stream silent past the limit after its first words? Then stop reading and say so.
            // If the reader does not leave its wait after the cancel, the stream is ended here so the turn can never stay "streaming".
            let watchdog = Task {
                var ticks = 0
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    if Task.isCancelled { return }
                    // Every 5 seconds the diagnostics get one line of what the stream has done: if the app has to be quit, the next launch
                    // can show how far this one got (counts and sizes only).
                    ticks += 1
                    if ticks % 5 == 0 { DiagnosticSnapshot.shared.record("chat stream progress \(activity.summary())") }
                    if activity.markStalledIfSilent(longerThan: StreamWatchdog.idleAfterText) {
                        DiagnosticSnapshot.shared.record("chat stream stalled \(activity.summary())", isError: true)
                        task.cancel()
                        try? await Task.sleep(nanoseconds: 1_500_000_000)
                        continuation.finish(throwing: AppError.network(status: nil, code: StreamWatchdog.stalledCode))
                        return
                    }
                }
            }
            continuation.onTermination = { _ in
                task.cancel()
                watchdog.cancel()
            }
        }
    }

    /// A non-2xx answer, with its (small) body, before it is mapped to an `AppError`.
    private struct HTTPRefusal: Error {
        let status: Int
        let body: Data
    }

    /// Opens the stream. A non-2xx answer is read as a JSON error body so backend error codes map to their specific UX —
    /// 429 free_limit_reached → "come back tomorrow", 401 anon_limit_reached → sign-in prompt (docs/ios/04 §2.1); without
    /// this every limit surfaced as a generic "streaming" failure. Bounded read: limit responses are tiny; the cap guards a
    /// misbehaving server.
    private func open(_ request: URLRequest) async throws -> (URLSession.AsyncBytes, URLResponse) {
        let (bytes, response) = try await session.bytes(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            var body = Data()
            for try await byte in bytes {
                body.append(byte)
                if body.count > 64 * 1024 { break }
            }
            throw HTTPRefusal(status: http.statusCode, body: body)
        }
        return (bytes, response)
    }

    /// `open`, with the rule `URLSessionAPIClient` has for plain requests: a 401 on an authenticated request forces ONE token
    /// refresh and reopens the stream with the new token. The guest limit (`anon_limit_reached`, also a 401) is not a token
    /// problem and is not refreshed; a failed refresh, or a second 401, is the sign-in error.
    private func openRefreshingOnce(_ request: URLRequest, requiresAuth: Bool) async throws -> (URLSession.AsyncBytes, URLResponse) {
        do {
            return try await open(request)
        } catch let refusal as HTTPRefusal {
            guard refusal.status == 401, requiresAuth,
                  !URLSessionAPIClient.isKnownLimit(status: refusal.status, data: refusal.body),
                  let retried = await auth.retryAfterUnauthorized(request) else {
                throw URLSessionAPIClient.mapChatHTTP(status: refusal.status, data: refusal.body)
            }
            do {
                return try await open(retried)
            } catch let second as HTTPRefusal {
                throw URLSessionAPIClient.mapChatHTTP(status: second.status, data: second.body)
            }
        }
    }
}
