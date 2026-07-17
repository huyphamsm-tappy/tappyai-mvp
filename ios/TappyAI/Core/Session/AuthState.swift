import Foundation

/// Auth tokens (Supabase JWT + refresh). Stored only in Keychain.
struct AuthTokens: Codable, Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
    /// Absolute expiry of the access token.
    let expiresAt: Date

    func isExpiring(within leeway: TimeInterval = 60, now: Date = Date()) -> Bool {
        expiresAt.timeIntervalSince(now) <= leeway
    }
}

/// The session-driven root state (drives `AppRootView`, ADR-002).
/// `.onboarding` is entered when authenticated but `profiles.onboarded == false`.
enum AuthState: Equatable, Sendable {
    case unknown            // during launch, before Keychain is read
    case anonymous
    case onboarding(userId: String)
    case authenticated(userId: String)

    var isAuthenticated: Bool {
        if case .authenticated = self { return true }
        return false
    }
}
