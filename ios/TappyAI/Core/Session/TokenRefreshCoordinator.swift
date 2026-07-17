import Foundation

/// Performs the actual token refresh network call. Phase 0 has no endpoints, so a concrete
/// implementation lands with the auth feature (Phase 1). Kept as a seam here (ADR-005 amendment).
protocol TokenRefreshing: Sendable {
    func refresh(_ current: AuthTokens) async throws -> AuthTokens
}

/// Placeholder used until the Supabase refresh call is wired in Phase 1. Always fails,
/// which the SessionStore treats as `refreshFailed` → logout.
struct UnavailableTokenRefreshing: TokenRefreshing {
    func refresh(_ current: AuthTokens) async throws -> AuthTokens {
        throw AppError.authentication(reason: .refreshFailed)
    }
}

/// Coalesces concurrent refreshes into a single in-flight request (ADR-004 "single-flight").
/// If N callers ask for a fresh token while one refresh is running, they all await the same task.
actor TokenRefreshCoordinator {
    private let refresher: TokenRefreshing
    private var inFlight: Task<AuthTokens, Error>?

    init(refresher: TokenRefreshing) { self.refresher = refresher }

    func refresh(_ current: AuthTokens) async throws -> AuthTokens {
        if let task = inFlight { return try await task.value }
        let task = Task { try await refresher.refresh(current) }
        inFlight = task
        defer { inFlight = nil }
        return try await task.value
    }
}
