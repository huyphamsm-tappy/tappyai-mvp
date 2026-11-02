import Foundation

/// Web `setCopied(true); setTimeout(() => setCopied(false), 2000)` (translate, scan, viet-content): the Copy button reads «Đã chép!» /
/// «Copied!» for two seconds. Pure so a view model can own it and a test can drive it with a fake pasteboard and a short delay.
@MainActor
enum CopyFeedback {
    static let seconds: Double = 2

    /// Writes `text` through `write`, raises the flag and drops it again after `delay` seconds.
    static func copy(_ text: String, write: (String) -> Void, flag: @escaping (Bool) -> Void, delay: Double = seconds) {
        write(text)
        flag(true)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            flag(false)
        }
    }
}
