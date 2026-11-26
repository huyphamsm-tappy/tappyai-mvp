import Foundation

/// Remembers what `ContentParser.parse` made of each reply, so the message list does not parse every reply again on every pass of its body
/// (audit #8: a long streaming report made the whole conversation lag). A finished reply is parsed once - its text is its key; the reply that is
/// STREAMING is parsed again at most every `minStreamInterval` seconds, or at once when its text just ended a line, and the stream's last text is
/// always parsed. Between two parses the previous result stands, and `hasPendingRefresh` says the view should draw once more when the words pause.
///
/// The clock is a parameter (`now`, any steady number of seconds), so the rules are tested without waiting. Not thread-safe: the message list
/// uses it from its body on the main thread.
final class ParsedContentCache {

    private struct Entry {
        let length: Int
        let digest: Int
        let parsed: ParsedContent
        let at: TimeInterval
    }

    /// Streaming replies are parsed again no more often than this.
    let minStreamInterval: TimeInterval
    /// How many replies are remembered; the oldest leaves first.
    let capacity: Int

    private let parse: (String) -> ParsedContent
    private var entries: [String: Entry] = [:]
    private var order: [String] = []
    private var stale: Set<String> = []

    init(minStreamInterval: TimeInterval = 0.05, capacity: Int = 200,
         parse: @escaping (String) -> ParsedContent = { ContentParser.parse($0) }) {
        self.minStreamInterval = minStreamInterval
        self.capacity = max(capacity, 1)
        self.parse = parse
    }

    /// How often a streaming reply of `length` bytes is parsed again: the base interval up to ~3,000 bytes, then longer in proportion (a 9,000-byte
    /// reply every 0.15 s, a 20,000-byte one every 0.33 s, never slower than 0.4 s): the parse costs more the longer the text, and it runs on the
    /// main thread, so a long reply must not take most of it.
    func streamInterval(forLength length: Int) -> TimeInterval {
        min(max(minStreamInterval, 0.4), minStreamInterval * max(1, Double(length) / 3000))
    }

    /// A streaming reply is showing words older than its text: the view should draw again after a short pause.
    var hasPendingRefresh: Bool { !stale.isEmpty }

    /// The parse of `content` for the reply `id`: remembered, or made now. `isStreaming` is true only for the reply being written.
    func parsed(id: String, content: String, isStreaming: Bool, now: TimeInterval) -> ParsedContent {
        let length = content.utf8.count
        let digest = content.hashValue
        if let entry = entries[id] {
            if entry.length == length && entry.digest == digest {
                stale.remove(id)
                return entry.parsed
            }
            if isStreaming && length >= entry.length && !content.hasSuffix("\n")
                && now >= entry.at && now - entry.at < streamInterval(forLength: length) {
                stale.insert(id)
                return entry.parsed
            }
        }
        let parseStarted = DispatchTime.now().uptimeNanoseconds
        let made = parse(content)
        // Measured on CI: a parse costs about 2 ms per 1,000 characters (an 8,000-character reply ~18 ms, up to 70 ms), and a streaming reply
        // is parsed up to 20 times a second on the main thread. A parse that takes long is recorded in the diagnostics (counts and times only).
        let tookMs = Double(DispatchTime.now().uptimeNanoseconds - parseStarted) / 1_000_000
        if tookMs > 60 { DiagnosticSnapshot.shared.record("reply parse slow ms=\(Int(tookMs)) chars=\(length) streaming=\(isStreaming)") }
        if entries[id] == nil {
            order.append(id)
            if order.count > capacity {
                let oldest = order.removeFirst()
                entries[oldest] = nil
                stale.remove(oldest)
            }
        }
        entries[id] = Entry(length: length, digest: digest, parsed: made, at: now)
        stale.remove(id)
        return made
    }
}
