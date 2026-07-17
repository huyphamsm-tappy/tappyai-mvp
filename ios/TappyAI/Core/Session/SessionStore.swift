import Foundation
import Combine

/// The single source of truth for authentication state and the JWT (ADR-004/005).
/// Both the Supabase client and the API client obtain the token from here — never a copy.
/// `ObservableObject` (not `@Observable`) so the foundation compiles on the eventual min-iOS
/// target regardless of whether it lands on 16 or 17 (ADR-003 alignment).
@MainActor
final class SessionStore: AppObservableObject {
    @AppPublished private(set) var state: AuthState = .unknown
    /// Server-authoritative anonymous identity (survey §0 · D1). Present while `state == .anonymous`
    /// once an anonymous session is adopted; powers history/recs/analytics. Never a "logged-in" state.
    @AppPublished private(set) var anonymousId: String?

    private var tokens: AuthTokens?
    private let storage: TokenStorage
    private let refresh: TokenRefreshCoordinator
    private let clock: () -> Date
    private let log = AppLogger.session

    init(storage: TokenStorage,
         refresher: TokenRefreshing = UnavailableTokenRefreshing(),
         clock: @escaping () -> Date = Date.init) {
        self.storage = storage
        self.refresh = TokenRefreshCoordinator(refresher: refresher)
        self.clock = clock
    }

    /// Synchronous launch bootstrap (F12 launch sequence): read Keychain and pick the root
    /// immediately, without blocking the first frame on any network call.
    func bootstrap() {
        if let saved = storage.load() {
            tokens = saved
            // `onboarded` is unknown until a lightweight profile check in Phase 1; default to authenticated.
            state = .authenticated(userId: Self.subject(from: saved) ?? "unknown")
            log.info("bootstrap: restored session")
        } else {
            state = .anonymous
            log.info("bootstrap: anonymous")
        }
    }

    /// Establish a session after a successful sign-in (called by the auth feature in Phase 1).
    func didAuthenticate(_ tokens: AuthTokens, onboarded: Bool) {
        self.tokens = tokens
        storage.save(tokens)
        let uid = Self.subject(from: tokens) ?? "unknown"
        state = onboarded ? .authenticated(userId: uid) : .onboarding(userId: uid)
    }

    func didCompleteOnboarding() {
        if case .onboarding(let uid) = state { state = .authenticated(userId: uid) }
    }

    /// Adopt a server-issued **anonymous** session (from the `POST /api/auth/anonymous` contract).
    /// The app remains logged-out (`state == .anonymous`) but now carries a bearer token so anon
    /// API calls (e.g. chat quota keyed on `anonymous_id`) work. Never overrides a real user session.
    func adoptAnonymousSession(_ tokens: AuthTokens, anonymousId: String) {
        guard !state.isAuthenticated else { return }
        if case .onboarding = state { return }
        self.tokens = tokens
        self.anonymousId = anonymousId
        storage.save(tokens)
        state = .anonymous
    }

    var userId: String? {
        switch state {
        case .authenticated(let uid), .onboarding(let uid): return uid
        case .anonymous, .unknown: return nil
        }
    }

    func logout() {
        tokens = nil
        anonymousId = nil
        storage.clear()
        state = .anonymous
        log.info("logout")
    }

    /// Returns a valid access token, refreshing (single-flight) if it is expiring.
    /// The API client's auth interceptor calls this. Throws if unauthenticated / refresh fails.
    func validAccessToken() async throws -> String {
        guard let current = tokens else { throw AppError.authentication(reason: .unauthenticated) }
        guard current.isExpiring(now: clock()) else { return current.accessToken }
        do {
            let fresh = try await refresh.refresh(current)
            tokens = fresh
            storage.save(fresh)
            return fresh.accessToken
        } catch {
            logout()
            throw AppError.authentication(reason: .refreshFailed)
        }
    }

    /// Force a token refresh (single-flight) after a 401 whose token had not yet "expired".
    /// Returns the new token, or nil if refresh failed (session is then logged out).
    func forceRefreshToken() async -> String? {
        guard let current = tokens else { return nil }
        do {
            let fresh = try await refresh.refresh(current)
            tokens = fresh
            storage.save(fresh)
            return fresh.accessToken
        } catch {
            logout()
            return nil
        }
    }

    /// Decode the `sub` (user id) claim from a JWT without verifying the signature
    /// (verification is the backend's job; the client only needs the id for routing).
    private static func subject(from tokens: AuthTokens) -> String? {
        let parts = tokens.accessToken.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return json["sub"] as? String
    }
}
