import Foundation

/// Orchestrates all authentication actions and updates the single authority (`SessionStore`).
/// Transport + routing only — every product rule stays server-side (Thin Client, docs/ios/14).
@MainActor
final class AuthRepository {
    private let auth: AuthService
    private let anon: AnonymousSessionService
    private let gate: ProfileGateService
    private let onboarding: OnboardingService
    private let zalo: ZaloAuthController
    private let webAuth: WebAuthenticator
    private let session: SessionStore
    private let log = AppLogger.auth

    /// Deep-link scheme + Google redirect (survey §5.1). Register these in Info.plist + Supabase allow-list (D4).
    private let callbackScheme = "tappyai"
    private let googleRedirect = URL(string: "tappyai://auth/callback")!

    init(auth: AuthService, anon: AnonymousSessionService, gate: ProfileGateService,
         onboarding: OnboardingService, zalo: ZaloAuthController, webAuth: WebAuthenticator,
         session: SessionStore) {
        self.auth = auth; self.anon = anon; self.gate = gate; self.onboarding = onboarding
        self.zalo = zalo; self.webAuth = webAuth; self.session = session
    }

    // MARK: Launch

    /// Reconcile the app session with the SDK after the synchronous Keychain bootstrap (survey §6):
    /// adopt a restored user session, else obtain a server-authoritative anonymous session (D1).
    func reconcileOnLaunch() async {
        if let tokens = await auth.currentTokens(), let uid = await auth.currentUserId() {
            let onboarded = await gate.isOnboarded(userId: uid)
            session.didAuthenticate(tokens, onboarded: onboarded)
        } else {
            await ensureAnonymousSession()
        }
    }

    /// Best-effort anonymous session via the stable contract. Degrades gracefully if the backend
    /// capability is not yet live (survey §0 governance) — browsing still works, just cookieless.
    func ensureAnonymousSession() async {
        guard !session.state.isAuthenticated else { return }
        do {
            let result = try await anon.start()
            session.adoptAnonymousSession(result.tokens, anonymousId: result.anonymousId)
            log.info("anonymous session adopted")
        } catch {
            log.info("anonymous session unavailable (backend dependency) — continuing without a token")
        }
    }

    // MARK: Email OTP (survey §1.5)

    func sendEmailOTP(email: String) async throws { try await auth.sendEmailOTP(email: email) }

    func verifyEmailOTP(email: String, code: String) async throws {
        let tokens = try await auth.verifyEmailOTP(email: email, token: code)
        await finishAuthentication(tokens)
    }

    // MARK: Register (survey §1.6) — returns true if a session was issued, false if "check your email"

    func register(email: String, password: String, fullName: String) async throws -> Bool {
        guard let tokens = try await auth.register(email: email, password: password, fullName: fullName) else {
            return false
        }
        await finishAuthentication(tokens)
        return true
    }

    // MARK: Google (survey §5.1)

    func signInWithGoogle() async throws {
        let url = try auth.oauthURL(provider: .google, redirectTo: googleRedirect)
        let callback = try await webAuth.authenticate(url: url, callbackScheme: callbackScheme)
        let tokens = try await auth.session(fromCallback: callback)
        await finishAuthentication(tokens)
    }

    // MARK: Zalo (survey §5.2 · D2) — one ASWebAuthenticationSession; existing routes; no new endpoints

    func signInWithZalo() async throws {
        let callback = try await zalo.authenticate()
        // Server sends tokens in the URL fragment: tappyai://auth/callback#access_token=…&refresh_token=…
        // Parse fragment into query items and hydrate directly; fall back to PKCE if fragment is absent.
        if let fragment = callback.fragment,
           let comps = URLComponents(string: "?\(fragment)"),
           let access = comps.queryItems?.first(where: { $0.name == "access_token" })?.value,
           let refresh = comps.queryItems?.first(where: { $0.name == "refresh_token" })?.value,
           !access.isEmpty, !refresh.isEmpty {
            let tokens = try await auth.hydrate(accessToken: access, refreshToken: refresh)
            await finishAuthentication(tokens)
        } else {
            let tokens = try await auth.session(fromCallback: callback)
            await finishAuthentication(tokens)
        }
    }

    // MARK: Onboarding (survey §1.9)

    func submitOnboarding(interests: [String], city: String) async throws {
        try await onboarding.submit(interests: interests, city: city)
        session.didCompleteOnboarding()
    }

    // MARK: Sign-out (survey §1.3)

    func signOut() async {
        await auth.signOut()
        session.logout()
        await ensureAnonymousSession()   // return to an anonymous session, not a tokenless state
    }

    // MARK: Helpers

    /// After any successful sign-in: apply the server-side onboarding gate and update `SessionStore`.
    /// The backend guarantees anon→account carry-over (history preservation, no duplicate identity,
    /// seamless upgrade); the client does NOT implement convert/merge (survey §0).
    private func finishAuthentication(_ tokens: AuthTokens) async {
        // Prefer extracting the subject directly from the JWT payload (no SDK round-trip needed).
        // The SDK call can return nil under transient state inconsistency immediately after sign-in,
        // which would silently skip onboarding for new users.
        if let uid = jwtSubject(from: tokens.access) {
            let onboarded = await gate.isOnboarded(userId: uid)
            session.didAuthenticate(tokens, onboarded: onboarded)
            return
        }
        // Fallback: SDK call; if still nil, mark onboarded to avoid permanently locking out the user.
        if let uid = await auth.currentUserId() {
            let onboarded = await gate.isOnboarded(userId: uid)
            session.didAuthenticate(tokens, onboarded: onboarded)
        } else {
            session.didAuthenticate(tokens, onboarded: true)
        }
    }

    private func jwtSubject(from jwt: String) -> String? {
        let parts = jwt.split(separator: ".", maxSplits: 2, omittingEmptySubsequences: false)
        guard parts.count == 3 else { return nil }
        var b64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj["sub"] as? String
    }
}
