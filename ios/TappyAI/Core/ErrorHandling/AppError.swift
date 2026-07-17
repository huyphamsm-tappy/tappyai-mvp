import Foundation

/// The single global error type the whole app surfaces. Feature code maps lower-level
/// failures (URLError, decoding, backend error bodies) into these cases so UI handling is uniform.
/// User-facing copy is intentionally minimal here; localized strings live in the String Catalog.
enum AppError: Error, Equatable {
    /// Transport/connectivity failure that is not specifically "offline".
    case network(status: Int?, code: String?)
    /// Authentication/authorization failure (401/403, expired session, refresh failed).
    case authentication(reason: AuthFailure)
    /// A streaming response failed or was malformed mid-stream.
    case streaming(reason: String)
    /// Client-side or server-side validation failure (400 / bad input).
    case validation(message: String)
    /// The request was explicitly cancelled (user navigated away, task cancelled).
    case cancellation
    /// No usable network connection.
    case offline
    /// Anything not otherwise classified.
    case unexpected(message: String)

    enum AuthFailure: Equatable {
        case unauthenticated        // no session
        case sessionExpired         // token expired, refresh needed
        case refreshFailed          // refresh attempt failed → force logout
        case forbidden              // authenticated but not allowed
        case anonLimitReached       // backend 401 anon_limit_reached
        case freeLimitReached       // backend 429 free_limit_reached
    }

    /// Whether the UI should offer a "Retry" affordance (see docs/ios/06 error states).
    var isRetriable: Bool {
        switch self {
        case .network, .streaming, .offline, .unexpected: return true
        case .authentication, .validation, .cancellation: return false
        }
    }
}
