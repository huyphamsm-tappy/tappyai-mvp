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

    /// 03/11: a POST/PATCH that answered 500/502/504/408 may already have been done by the server; sending it again made a second post, review or
    /// payment. For those methods only a status that means "not processed" (429, 503) is retried. GET/PUT/DELETE keep the full list.
    func shouldRetry(status: Int, attempt: Int, method: HTTPMethod) -> Bool {
        guard shouldRetry(status: status, attempt: attempt) else { return false }
        switch method {
        case .post, .patch: return status == 429 || status == 503
        case .get, .put, .delete: return true
        }
    }

    /// Exponential backoff (no external jitter source — `Math.random` is unavailable in the
    /// build sandbox, so a deterministic exponential is used; add jitter in-app if needed).
    func delay(forAttempt attempt: Int) -> TimeInterval {
        baseDelay * pow(2, Double(attempt))
    }
}
