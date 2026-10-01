import Foundation

/// The two claims of a Supabase access token the client needs for ROUTING (never for trust — the
/// server verifies the signature): who the subject is, and whether it is a guest.
///
/// 🚨 The guest case is the point. A guest session is a real Supabase session (`POST /api/auth/anonymous`
/// hydrates the SDK and is saved to the Keychain like any other), so "a token exists" does NOT mean
/// "an account is signed in". Treating it that way made a relaunched guest look signed in on the
/// device while the server (`user.is_anonymous`) kept treating it as a guest.
struct JWTClaims: Equatable, Sendable {
    let subject: String?
    let isAnonymous: Bool

    init(subject: String?, isAnonymous: Bool) {
        self.subject = subject
        self.isAnonymous = isAnonymous
    }

    /// nil when the string is not a three-part JWT with a JSON payload.
    init?(jwt: String) {
        let parts = jwt.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count >= 2 else { return nil }
        var b64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        self.subject = json["sub"] as? String
        // Supabase writes a Bool; tolerate 1/"true" so a different issuer shape never reads as a signed-in account.
        switch json["is_anonymous"] {
        case let flag as Bool: self.isAnonymous = flag
        case let number as NSNumber: self.isAnonymous = number.boolValue
        case let text as String: self.isAnonymous = text.lowercased() == "true"
        default: self.isAnonymous = false
        }
    }
}

extension AuthTokens {
    var claims: JWTClaims? { JWTClaims(jwt: accessToken) }
    /// True for a guest session. An unreadable token is NOT a guest: it stays what it was stored as.
    var isAnonymousSession: Bool { claims?.isAnonymous ?? false }
}
