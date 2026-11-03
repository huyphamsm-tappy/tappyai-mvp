import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

/// Sign in with Apple: native `ASAuthorizationAppleIDProvider` sheet → Apple identity token →
/// Supabase `signInWithIdToken(provider: .apple, idToken:, nonce:)`.
///
/// Hidden until the backend is ready. Neither rc/web-uat nor main configures Apple yet
/// (AUTH_PROVIDERS is google/zalo/email, and /api/config has no Apple flag), so the button
/// appears only when the server says so: `flags.appleSignIn == true` or an enabled `"apple"`
/// entry in `auth.providers`. Absent (every server today) = hidden, nothing else changes.
///
/// What Apple's rules add on top of the sign-in itself (all handled here or in `AuthRepository`):
///  - **Name and email arrive ONLY the first time** a person authorises this app (`fullName` is nil
///    on every later sign-in), so the name is saved to the profile at once, and only when the profile
///    has none — never overwriting a name the person chose.
///  - **Hidden email**: the address may be a `privaterelay.appleid.com` relay, or absent from the
///    token. Nothing in the app assumes a real, present, or stable address.
///  - **Revocation**: a person can stop using Apple ID with the app in iOS Settings at any time; the
///    app must notice (`AppleCredentialMonitor`) and sign out.
enum AppleSignIn {
    static func isEnabled(flag: Bool?, providers: [String]) -> Bool {
        flag == true || providers.contains("apple")
    }

    /// A random nonce. The RAW value goes to Supabase; Apple receives its SHA-256 (`sha256`), and
    /// Supabase checks that the token's nonce claim is the hash of what it was given.
    ///
    /// Characters come from the system CSPRNG with rejection sampling, so every one of the 65
    /// characters is equally likely (a plain `% 65` would favour the first 60).
    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        let limit = 256 - (256 % charset.count)   // 195: bytes at or above it are discarded
        var out: [Character] = []
        while out.count < length {
            var bytes = [UInt8](repeating: 0, count: length)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
                // Not expected. UUIDs are still random (122 bits each); the nonce only has to be unguessable.
                return String((UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "").prefix(length))
            }
            for b in bytes where Int(b) < limit && out.count < length { out.append(charset[Int(b) % charset.count]) }
        }
        return String(out)
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// The name Apple sent, formatted for display, or nil when Apple sent none (every sign-in after the first).
    static func displayName(_ name: PersonNameComponents?) -> String? {
        guard let name else { return nil }
        let text = PersonNameComponentsFormatter.localizedString(from: name, style: .default, options: [])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    /// What to do with the state Apple reports for the saved Apple user id.
    enum CredentialAction: Equatable { case keep, signOut }

    /// `.revoked` — the person removed the app from their Apple ID: sign out. `.notFound` is NOT a
    /// sign-out: it also happens on a device where this Apple ID never signed in (a new phone restoring a
    /// session, the simulator), and signing someone out for that would be a bug. `.authorized` and
    /// `.transferred` keep the session.
    static func action(for state: ASAuthorizationAppleIDProvider.CredentialState) -> CredentialAction {
        state == .revoked ? .signOut : .keep
    }
}

/// The Apple user identifier of the account signed in through Apple, kept in the Keychain so the app
/// can ask Apple whether the person has since revoked it. Cleared on sign-out.
struct AppleCredentialStore {
    static let key = "apple.user.id"
    private let storage: SecretStorage

    init(storage: SecretStorage = KeychainStore()) { self.storage = storage }

    var userId: String? { storage.string(for: Self.key) }
    func record(_ userId: String) { try? storage.set(userId, for: Self.key) }
    func clear() { storage.remove(Self.key) }
}

/// Watches for the person revoking Sign in with Apple. Checked at launch, when the app returns to the
/// foreground, and whenever iOS posts `credentialRevokedNotification`.
@MainActor
final class AppleCredentialMonitor {
    private let store: AppleCredentialStore
    private let onRevoked: () async -> Void
    private var observers: [NSObjectProtocol] = []

    init(store: AppleCredentialStore = AppleCredentialStore(), onRevoked: @escaping () async -> Void) {
        self.store = store
        self.onRevoked = onRevoked
    }

    func start() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: ASAuthorizationAppleIDProvider.credentialRevokedNotification,
                                            object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.revoked() }
        })
        observers.append(center.addObserver(forName: UIApplication.willEnterForegroundNotification,
                                            object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.checkNow() }
        })
        Task { await checkNow() }
    }

    func checkNow() async {
        guard let id = store.userId else { return }
        let state: ASAuthorizationAppleIDProvider.CredentialState = await withCheckedContinuation { continuation in
            ASAuthorizationAppleIDProvider().getCredentialState(forUserID: id) { state, _ in continuation.resume(returning: state) }
        }
        if AppleSignIn.action(for: state) == .signOut { await revoked() }
    }

    private func revoked() async {
        store.clear()
        await onRevoked()
    }
}
