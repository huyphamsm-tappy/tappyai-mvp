import Foundation
import Supabase

/// `AuthService` implementation over supabase-swift. Transport only — no product logic.
///
/// NOTE (unverified on Windows): the exact supabase-swift 2.x method names/signatures below must be
/// confirmed against the pinned version on a Mac (e.g. `signInWithOTP`, `verifyOTP`, `signUp`,
/// `getOAuthSignInURL`, `session(from:)`, `setSession`, `refreshSession`, `signOut`). The shapes
/// used here match supabase-swift 2.x at time of writing.
final class SupabaseAuthService: AuthService {
    private let supabase: SupabaseClient
    private let log = AppLogger.auth

    init(supabase: SupabaseClient) { self.supabase = supabase }

    func currentTokens() async -> AuthTokens? {
        guard let session = try? await supabase.auth.session else { return nil }
        return AuthTokens(session: session)
    }

    func currentUserId() async -> String? {
        (try? await supabase.auth.session)?.user.id.uuidString
    }

    func sendEmailOTP(email: String) async throws {
        try await supabase.auth.signInWithOTP(email: email, shouldCreateUser: true)
    }

    func verifyEmailOTP(email: String, token: String) async throws -> AuthTokens {
        let session = try await supabase.auth.verifyOTP(email: email, token: token, type: .email)
        return AuthTokens(session: session)
    }

    func register(email: String, password: String, fullName: String) async throws -> AuthTokens? {
        let response = try await supabase.auth.signUp(
            email: email,
            password: password,
            data: ["full_name": .string(fullName)]
        )
        // If email confirmation is disabled, a session is returned; else nil → "check your email".
        return response.session.map(AuthTokens.init(session:))
    }

    func oauthURL(provider: OAuthProviderKind, redirectTo: URL) throws -> URL {
        try supabase.auth.getOAuthSignInURL(
            provider: Provider(rawValue: provider.rawValue) ?? .google,
            redirectTo: redirectTo
        )
    }

    func session(fromCallback url: URL) async throws -> AuthTokens {
        let session = try await supabase.auth.session(from: url)
        return AuthTokens(session: session)
    }

    func hydrate(accessToken: String, refreshToken: String) async throws -> AuthTokens {
        let session = try await supabase.auth.setSession(accessToken: accessToken, refreshToken: refreshToken)
        return AuthTokens(session: session)
    }

    func refresh() async throws -> AuthTokens {
        let session = try await supabase.auth.refreshSession()
        return AuthTokens(session: session)
    }

    func signOut() async {
        do { try await supabase.auth.signOut() }
        catch { log.error("signOut failed: \(error.localizedDescription)") }
    }
}
