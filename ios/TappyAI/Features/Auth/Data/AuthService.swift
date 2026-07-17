import Foundation

/// Auth operations backed by Supabase. The client performs only auth transport; all product rules
/// (quotas, gating, onboarding enforcement) stay server-side (Thin Client, docs/ios/14).
protocol AuthService: Sendable {
    /// Current SDK session, if one is already restored (fast, no network).
    func currentTokens() async -> AuthTokens?
    func currentUserId() async -> String?

    // Email OTP (passwordless) — survey §1.5
    func sendEmailOTP(email: String) async throws
    func verifyEmailOTP(email: String, token: String) async throws -> AuthTokens

    // Email + password registration — survey §1.6
    /// Returns tokens if a session is issued immediately, or nil if email confirmation is required.
    func register(email: String, password: String, fullName: String) async throws -> AuthTokens?

    // OAuth (Google) — survey §5.1. Returns the provider auth URL to open in a web-auth session.
    func oauthURL(provider: OAuthProviderKind, redirectTo: URL) throws -> URL
    /// Exchange the callback URL (PKCE `code`) captured from the web-auth session for a session.
    func session(fromCallback url: URL) async throws -> AuthTokens

    // Anonymous contract hydration — set the SDK session from tokens issued by POST /api/auth/anonymous.
    func hydrate(accessToken: String, refreshToken: String) async throws -> AuthTokens

    func refresh() async throws -> AuthTokens
    func signOut() async
}

enum OAuthProviderKind: String, Sendable {
    case google
    // Facebook stays disabled (survey §1.3); Zalo is not a Supabase provider (custom flow §5.2).
}
