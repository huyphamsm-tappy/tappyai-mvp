import Foundation

/// A clip or link posted without a real place is stored, and returned by the server, under the composer's placeholder name.
/// It is DATA the server writes (not text shown to anyone), so it lives in one place and every screen compares through it.
enum ComposerSentinel {
    static func isSharePlaceholder(_ name: String?) -> Bool {
        let n = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return n == "Chia sẻ" || n == "Chia se"
    }
}
