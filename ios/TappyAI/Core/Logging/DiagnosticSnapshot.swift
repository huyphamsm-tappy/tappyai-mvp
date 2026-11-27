import Foundation

/// Bounded record of what the app did, for the owner to copy from the subscription screen on a TestFlight build. Lines are built only at the
/// call sites from allowlisted values (product IDs, counts, sizes, durations, safe error tags) — never the text of a conversation. The lines are
/// kept in the app's own cache folder so that, after the app had to be quit (a stuck chat), the NEXT launch can still show what the last session
/// was doing. Nothing is sent anywhere; it is copied only when the person taps the Copy Diagnostics button.
///
/// Thread-safe on purpose: the stream watchdog and the main-thread stall watch record from background threads, and a stall record is exactly the
/// one that must get written while the main thread is blocked.
final class DiagnosticSnapshot: @unchecked Sendable {
    static let shared = DiagnosticSnapshot()
    static let capacity = 120

    private let lock = NSLock()
    private var lines: [String] = []
    private var previous: [String] = []
    private let file: URL?

    private init() {
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        file = folder?.appendingPathComponent("tappy-diagnostics.log")
        if let file, let text = try? String(contentsOf: file, encoding: .utf8) {
            previous = text.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
        }
    }

    /// Records one event and mirrors it to the unified log. Use only allowlisted values in `message`.
    func record(_ message: String, isError: Bool = false) {
        if isError {
            AppLogger.app.error(message)
        } else {
            AppLogger.app.notice(message)
        }
        let line = "\(Date().formatted(.iso8601)) \(message)"
        lock.lock()
        lines.append(line)
        if lines.count > Self.capacity {
            lines.removeFirst(lines.count - Self.capacity)
        }
        let text = lines.joined(separator: "\n")
        lock.unlock()
        if let file { try? text.write(to: file, atomically: true, encoding: .utf8) }
    }

    /// Plain-text snapshot: a header with the app version and build, this session's events, then the events of the session before it.
    func snapshot() -> String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "unknown"
        let build = info?["CFBundleVersion"] as? String ?? "unknown"
        lock.lock()
        let current = lines
        let before = previous
        lock.unlock()
        let header = "TappyAI iOS diagnostics app=\(version) build=\(build) events=\(current.count) previousSessionEvents=\(before.count)"
        var out = [header] + current
        if !before.isEmpty { out += ["--- previous session ---"] + before }
        return out.joined(separator: "\n")
    }
}
