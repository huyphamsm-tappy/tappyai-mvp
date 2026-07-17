import Foundation

/// Bridges the foundation's `TokenRefreshing` (used by `SessionStore`, ADR-004/005) to the Supabase
/// SDK's refresh. `SessionStore` remains the single token authority for the app's Bearer calls; the
/// SDK is the refresh engine. Replaces `UnavailableTokenRefreshing` (Phase 0 stub).
struct SupabaseTokenRefreshing: TokenRefreshing {
    let auth: AuthService

    func refresh(_ current: AuthTokens) async throws -> AuthTokens {
        try await auth.refresh()
    }
}
