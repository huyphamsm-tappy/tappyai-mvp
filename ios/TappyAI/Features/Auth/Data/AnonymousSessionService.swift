import Foundation

/// Obtains a server-authoritative anonymous session via the STABLE contract
/// `POST /api/auth/anonymous → { access_token, refresh_token, anonymous_id, expires_at }`
/// (survey §0 · D1). The client is implementation-agnostic — it never assumes how the backend
/// mints these tokens. On success it hydrates the SDK session so Bearer + refresh work uniformly.
struct AnonymousSessionService: Sendable {
    let api: APIClient
    let auth: AuthService

    struct Result: Sendable { let tokens: AuthTokens; let anonymousId: String }

    func start() async throws -> Result {
        let endpoint = Endpoint(
            path: "/api/auth/anonymous",
            method: .post,
            body: Data("{}".utf8),
            requiresAuth: false
        )
        let data = try await api.send(endpoint)
        let decoded = try JSONDecoder().decode(AnonymousSessionResponse.self, from: data)
        // Hydrate the SDK so subsequent Bearer/refresh use this session; keep the contract's tokens.
        let tokens = try await auth.hydrate(accessToken: decoded.accessToken, refreshToken: decoded.refreshToken)
        return Result(tokens: tokens, anonymousId: decoded.anonymousId)
    }
}
