import Foundation

/// Retry/backoff policy for transient failures. Conservative by default — the backend owns
/// idempotency concerns, so only safe/transient statuses are retried.
struct RetryPolicy: Sendable {
    let maxRetries: Int
    let retryableStatusCodes: Set<Int>
    let baseDelay: TimeInterval

    static let `default` = RetryPolicy(maxRetries: 2,
                                       retryableStatusCodes: [408, 429, 500, 502, 503, 504],
                                       baseDelay: 0.4)
    static let none = RetryPolicy(maxRetries: 0, retryableStatusCodes: [], baseDelay: 0)

    func shouldRetry(status: Int, attempt: Int) -> Bool {
        attempt < maxRetries && retryableStatusCodes.contains(status)
    }

    /// Exponential backoff (no external jitter source — `Math.random` is unavailable in the
    /// build sandbox, so a deterministic exponential is used; add jitter in-app if needed).
    func delay(forAttempt attempt: Int) -> TimeInterval {
        baseDelay * pow(2, Double(attempt))
    }
}
