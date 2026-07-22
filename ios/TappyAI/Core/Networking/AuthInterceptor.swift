import Foundation

/// Supplies the access token to the networking layer and can force a refresh.
/// Implemented by an adapter over `SessionStore` so the JWT has a single authority (ADR-004).
protocol AuthProviding: Sendable {
    /// Current valid token (refreshing if expiring). Returns nil when unauthenticated.
    func accessToken() async -> String?
    /// Force a refresh after a 401 and return the new token, or nil if it failed.
    func forceRefresh() async -> String?
}

/// Attaches `Authorization: Bearer` and centralizes the 401 → refresh-once → retry-once rule.
struct AuthInterceptor {
    let provider: AuthProviding

    func authorize(_ request: inout URLRequest) async {
        if let token = await provider.accessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    /// On a 401 for an authed request, force one refresh and return the reauthorized request to retry.
    func retryAfterUnauthorized(_ request: URLRequest) async -> URLRequest? {
        guard let token = await provider.forceRefresh() else { return nil }
        var retried = request
        retried.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return retried
    }
}
