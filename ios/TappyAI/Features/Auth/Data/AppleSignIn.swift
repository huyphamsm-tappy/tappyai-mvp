import CryptoKit
import Foundation

/// Sign in with Apple: native `ASAuthorizationAppleIDProvider` sheet → Apple identity token →
/// Supabase `signInWithIdToken(provider: .apple, idToken:, nonce:)`.
///
/// Hidden until the backend is ready. Neither rc/web-uat nor main configures Apple yet
/// (AUTH_PROVIDERS is google/zalo/email, and /api/config has no Apple flag), so the button
/// appears only when the server says so: `flags.appleSignIn == true` or an enabled `"apple"`
/// entry in `auth.providers`. Absent (every server today) = hidden, nothing else changes.
enum AppleSignIn {
    static func isEnabled(flag: Bool?, providers: [String]) -> Bool {
        flag == true || providers.contains("apple")
    }

    /// A random nonce. The RAW value goes to Supabase; Apple receives its SHA-256 (`sha256`), and
    /// Supabase checks that the token's nonce claim is the hash of what it was given.
    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in charset[Int(generator.next() % UInt64(charset.count))] })
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
