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

    /**
     Hands the conversations of an anonymous session to the account that has just signed in.

     🚨 C33. iOS minted anonymous sessions and never called this — `claim-anonymous` appeared
     nowhere in the tree. A user who chatted as a guest and then signed in silently lost that
     history, on iOS only; Web and Android both claim.

     `POST /api/auth/claim-anonymous` with the NEW session as Bearer and the OLD anonymous access
     token in the body as proof of possession — the route verifies BOTH tokens itself and takes
     neither uuid from the body, which is what stops one account claiming another guest's history.

     Best-effort by design: a failure here must never block a sign-in that already succeeded, so
     the caller ignores the outcome. The worst case is the pre-fix behaviour.
     */
    func claim(anonymousAccessToken: String) async throws {
        guard !anonymousAccessToken.isEmpty else { return }
        let body = try JSONSerialization.data(
            withJSONObject: ["anonymous_access_token": anonymousAccessToken]
        )
        let endpoint = Endpoint(
            path: "/api/auth/claim-anonymous",
            method: .post,
            body: body,
            requiresAuth: true
        )
        _ = try await api.send(endpoint)
    }
}
