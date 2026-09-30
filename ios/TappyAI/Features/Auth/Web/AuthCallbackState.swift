import Foundation
import Security

/// Small secret storage seam so the state store can be tested without the Keychain.
protocol SecretStorage {
    func set(_ string: String, for key: String) throws
    func string(for key: String) -> String?
    func remove(_ key: String)
}

extension KeychainStore: SecretStorage {}

/// Why a sign-in callback was refused. The user sees one sentence ("try again"), never the reason.
enum AuthCallbackError: Error, Equatable, LocalizedError {
    /// No sign-in was started, the state was missing / different, or it expired.
    case stateMismatch
    /// The callback carried a shape this sign-in method never produces (e.g. tokens for Google).
    case unexpectedShape

    var errorDescription: String? {
        NSLocalizedString("auth.error.callbackRejected", comment: "")
    }
}

/**
 MOB-1 (security audit 2026-09-30): a sign-in callback is only accepted when THIS app started
 that sign-in a moment ago.

 Before this, the Zalo flow imported whatever `access_token`/`refresh_token` came back in the
 callback fragment. A page that reached the web-auth session (e.g. the attacker's own magic link
 `/auth/confirm?…&platform=ios`) could hand the app the ATTACKER's session, and everything the user
 did next — chats, places, memory — would land in the attacker's account.

 Now: `begin()` makes a random state (32 bytes, base64url) and keeps it in the Keychain for
 `ttl`; the app sends it as `app_state`, the server echoes it as `app_state` in the callback, and
 `consume(_:)` accepts only an exact, unexpired match. The stored state is deleted on every
 `consume` — match or not — so each state works at most once.
 */
final class AuthCallbackStateStore {
    static let ttl: TimeInterval = 10 * 60
    static let key = "auth.callback.state"

    private let storage: SecretStorage
    private let now: () -> Date

    init(storage: SecretStorage = KeychainStore(), now: @escaping () -> Date = Date.init) {
        self.storage = storage
        self.now = now
    }

    /// A fresh state for one sign-in attempt; replaces any earlier unfinished one.
    func begin() -> String {
        let state = Self.randomState()
        let expires = Int(now().addingTimeInterval(Self.ttl).timeIntervalSince1970)
        try? storage.set("\(expires)|\(state)", for: Self.key)
        return state
    }

    /// True only if `received` equals the pending state and it has not expired. Always clears it.
    func consume(_ received: String?) -> Bool {
        defer { clear() }
        guard let received, !received.isEmpty,
              let stored = storage.string(for: Self.key) else { return false }
        let parts = stored.split(separator: "|", maxSplits: 1).map(String.init)
        guard parts.count == 2, let expires = TimeInterval(parts[0]) else { return false }
        guard now().timeIntervalSince1970 <= expires else { return false }
        return Self.constantTimeEqual(parts[1], received)
    }

    /// Drops the pending state (the user cancelled, or the flow failed before a callback).
    func clear() { storage.remove(Self.key) }

    static func randomState() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            // SecRandom failing is not expected; UUIDs are still random (122 bits).
            return (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func constantTimeEqual(_ a: String, _ b: String) -> Bool {
        let x = Array(a.utf8), y = Array(b.utf8)
        guard x.count == y.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<x.count { diff |= x[i] ^ y[i] }
        return diff == 0
    }
}

/// What a sign-in may do with a callback it captured. Pure, so every rule is unit-tested.
enum AuthCallbackPolicy {
    enum Accepted: Equatable {
        /// Import this session (Zalo's token fragment).
        case tokens(access: String, refresh: String)
        /// Exchange the PKCE `code` with the verifier the SDK stored when the sign-in started.
        case pkceCode
    }

    /// Zalo: the state must match first — before any token is looked at.
    static func zalo(_ url: URL, states: AuthCallbackStateStore) throws -> Accepted {
        guard states.consume(AuthCallbackURL.appState(in: url)) else { throw AuthCallbackError.stateMismatch }
        if let t = AuthCallbackURL.tokens(in: url) { return .tokens(access: t.access, refresh: t.refresh) }
        if AuthCallbackURL.code(in: url) != nil { return .pkceCode }
        throw AuthCallbackError.unexpectedShape
    }

    /// Google (Supabase PKCE): only a `code` is accepted. A foreign code cannot be exchanged —
    /// the SDK's verifier for THIS attempt is required — so the PKCE verifier is the one-time
    /// binding here. A token fragment is never Google's shape and is refused outright.
    static func google(_ url: URL) throws -> Accepted {
        guard AuthCallbackURL.tokens(in: url) == nil, AuthCallbackURL.code(in: url) != nil else {
            throw AuthCallbackError.unexpectedShape
        }
        return .pkceCode
    }
}

/// Reads the parts of a `tappyai://auth/callback` URL that sign-in cares about.
enum AuthCallbackURL {
    /// `app_state` from the fragment (token callbacks) or the query (code callbacks).
    static func appState(in url: URL) -> String? {
        fragmentItems(url)["app_state"] ?? queryItems(url)["app_state"]
    }

    /// Tokens from the fragment, when both are present and non-empty.
    static func tokens(in url: URL) -> (access: String, refresh: String)? {
        let items = fragmentItems(url)
        guard let access = items["access_token"], let refresh = items["refresh_token"],
              !access.isEmpty, !refresh.isEmpty else { return nil }
        return (access, refresh)
    }

    /// A PKCE `code` in the query.
    static func code(in url: URL) -> String? {
        queryItems(url)["code"].flatMap { $0.isEmpty ? nil : $0 }
    }

    /// The app's own sign-in callback — never a navigation target, never imported outside a
    /// sign-in the app started.
    static func isAuthCallback(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "tappyai" else { return false }
        let host = url.host?.lowercased() ?? ""
        return host == "auth" || host == "auth-callback"
    }

    private static func fragmentItems(_ url: URL) -> [String: String] {
        guard let fragment = url.fragment, !fragment.isEmpty,
              let comps = URLComponents(string: "?\(fragment)") else { return [:] }
        return dictionary(comps.queryItems)
    }

    private static func queryItems(_ url: URL) -> [String: String] {
        dictionary(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
    }

    private static func dictionary(_ items: [URLQueryItem]?) -> [String: String] {
        var out: [String: String] = [:]
        for item in items ?? [] where out[item.name] == nil { out[item.name] = item.value ?? "" }
        return out
    }
}
