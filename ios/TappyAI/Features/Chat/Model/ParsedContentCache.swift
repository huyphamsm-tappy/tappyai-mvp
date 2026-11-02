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
                && now >= entry.at && now - entry.at < minStreamInterval {
                stale.insert(id)
                return entry.parsed
            }
        }
        let made = parse(content)
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
