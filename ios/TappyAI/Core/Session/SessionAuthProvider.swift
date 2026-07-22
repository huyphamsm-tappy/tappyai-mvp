import Foundation

/// Adapts `SessionStore` (the single JWT authority) to the networking layer's `AuthProviding`.
/// Keeps the token in exactly one place — the networking layer never caches a copy (ADR-004).
struct SessionAuthProvider: AuthProviding {
    let session: SessionStore   // @MainActor-isolated; calls hop to the main actor via await.

    func accessToken() async -> String? {
        try? await session.validAccessToken()
    }

    func forceRefresh() async -> String? {
        await session.forceRefreshToken()
    }
}
