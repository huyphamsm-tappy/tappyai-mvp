import Foundation

/// Bounded, in-memory record of Pro product-loading outcomes, for the owner to copy from the
/// subscription screen on a TestFlight build. Lines are built only at the call sites from
/// allowlisted values (product IDs, counts, durations, safe error tags). Nothing is persisted,
/// sent anywhere, or copied unless the user taps the Copy Diagnostics button.
@MainActor
final class DiagnosticSnapshot {
    static let shared = DiagnosticSnapshot()
    static let capacity = 30

    private var lines: [String] = []

    private init() {}

    /// Records one event and mirrors it to the unified log. Use only allowlisted values in `message`.
    func record(_ message: String, isError: Bool = false) {
        if isError {
            AppLogger.app.error(message)
        } else {
            AppLogger.app.notice(message)
        }
        lines.append("\(Date().formatted(.iso8601)) \(message)")
        if lines.count > Self.capacity {
            lines.removeFirst(lines.count - Self.capacity)
        }
    }

    /// Plain-text snapshot: a header with the app version and build, then the recorded events in order.
    func snapshot() -> String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "unknown"
        let build = info?["CFBundleVersion"] as? String ?? "unknown"
        let header = "TappyAI iOS diagnostics app=\(version) build=\(build) events=\(lines.count)"
        return ([header] + lines).joined(separator: "\n")
    }
}
