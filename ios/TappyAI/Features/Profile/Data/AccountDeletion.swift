import Foundation

// In-app account deletion (App Store 5.1.1(v)) — iOS side of rc/web-uat
// `POST /api/account/delete` (`src/app/api/account/delete/route.ts`, `src/lib/account/selfDelete.ts`).
//
//  • Gated by `flags.accountSelfDelete` in `GET /api/config` (web `ACCOUNT_SELF_DELETE_ENABLED`,
//    off by default and not on production). Off or absent → the Settings row keeps the email request.
//  • Body `{"confirm": "XÓA" | "XOÁ" | "DELETE"}` — the server normalises (NFC, trim, uppercase)
//    and accepts any of the three whatever the language.
//  • The delete is immediate and permanent (no grace period); on success the app signs out.
//  • 404 `not_available` (flag turned off after the row was shown) → fall back to the email request.
//  • Sign in with Apple accounts (App Review 5.1.1(v)): the server revokes the Apple authorisation BEFORE it deletes, using a fresh
//    single-use `authorizationCode`. The first request carries no code; an Apple account is answered 409 `apple_authorization_required`
//    (nothing deleted), the app then asks the person to confirm with Apple (`AppleReauthorizer`) and sends the SAME request again with
//    `apple_authorization_code`. Non-Apple accounts never see this. The code is held in memory for that one request — never stored,
//    logged or shown. Errors (account NOT deleted in any of them): 400 invalid code, 409 `apple_identity_mismatch`, 502
//    `apple_revoke_failed`, 503 `apple_revoke_unavailable`. See docs/ios/APPLE-ACCOUNT-DELETION-HANDOFF.md in the web repo.

enum AccountDeletion {
    /// Words the server accepts as the typed confirmation (`selfDelete.ts`): "XÓA", "XOÁ", "DELETE".
    /// Protocol values compared against input, not display text — written as Unicode escapes
    /// (precomposed Ó U+00D3, Á U+00C1) so the iOS localization guard does not read them as prose.
    static let acceptedWords: Set<String> = ["X\u{00D3}A", "XO\u{00C1}", "DELETE"]

    /// Same normalisation as the server: NFC, trimmed, uppercased.
    static func isConfirmWord(_ input: String) -> Bool {
        let normalised = input.precomposedStringWithCanonicalMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        return acceptedWords.contains(normalised)
    }

    /// Which way the Settings row goes.
    static func usesInAppDeletion(flag: Bool?) -> Bool { flag == true }
}

/// What the delete screen shows after the request (web `DeleteAccountView` + Android mapping).
enum AccountDeletionOutcome: Equatable, Sendable {
    case deleted
    /// 409 `staff_account`
    case staffAccount
    /// 401 / 403 — session expired or anonymous
    case signInAgain
    /// 404 `not_available` — self-delete switched off: use the email request
    case notAvailable
    /// Anything else: the account is unchanged
    case failed
    /// 409 `apple_authorization_required` — an Apple account: confirm with Apple, then send again. Also what the screen shows when
    /// the person cancels the Apple sheet (the account is unchanged).
    case appleAuthorizationRequired
    /// 400 after a request that carried a code — expired, already used or not for this app. The account is unchanged.
    case appleAuthorizationInvalid
    /// 409 `apple_identity_mismatch` — they confirmed with a different Apple ID. The account is unchanged.
    case appleIdentityMismatch
    /// 503 `apple_revoke_unavailable` — Apple unlinking is not set up on the server; the account is unchanged.
    case appleUnavailable
    /// 502 `apple_revoke_failed` — Apple did not confirm; the account is unchanged. Try again.
    case appleRevokeFailed

    /// `appleCodeSent`: this request carried an Apple authorization code. The client maps a 400 to `.validation` without its code,
    /// so «400 after sending a code» is how an invalid code is recognised.
    static func from(_ result: Result<Void, Error>, appleCodeSent: Bool = false) -> AccountDeletionOutcome {
        switch result {
        case .success: return .deleted
        case .failure(let error):
            switch error as? AppError {
            case .network(let status, let code)?:
                if status == 409, code == "apple_authorization_required" { return .appleAuthorizationRequired }
                if status == 409, code == "apple_identity_mismatch" { return .appleIdentityMismatch }
                if status == 409 { return .staffAccount }
                if status == 502, code == "apple_revoke_failed" { return .appleRevokeFailed }
                if status == 503, code == "apple_revoke_unavailable" { return .appleUnavailable }
                if status == 404 { return .notAvailable }
                return .failed
            case .validation?:
                return appleCodeSent ? .appleAuthorizationInvalid : .failed
            case .authentication(.unauthenticated)?, .authentication(.forbidden)?,
                 .authentication(.sessionExpired)?, .authentication(.refreshFailed)?:
                return .signInAgain
            default: return .failed
            }
        }
    }

    /// The sentence shown under the form for a failure (nil when there is nothing to show).
    var errorKey: String? {
        switch self {
        case .staffAccount: return "account.delete.error.staff"
        case .signInAgain: return "account.delete.error.signIn"
        case .failed: return "account.delete.error.failed"
        case .appleAuthorizationRequired: return "account.delete.error.apple.required"
        case .appleAuthorizationInvalid: return "account.delete.error.apple.invalid"
        case .appleIdentityMismatch: return "account.delete.error.apple.mismatch"
        case .appleUnavailable: return "account.delete.error.apple.unavailable"
        case .appleRevokeFailed: return "account.delete.error.apple.failed"
        case .deleted, .notAvailable: return nil
        }
    }
}

struct AccountDeletionService {
    let api: APIClient

    /// `POST /api/account/delete {"confirm": word}` (+ `"apple_authorization_code"` on the second attempt of an Apple account).
    /// Throws the mapped `AppError` on failure.
    func requestSelfDeletion(confirm word: String, appleAuthorizationCode: String? = nil) async throws {
        var fields: [String: String] = ["confirm": word]
        if let code = appleAuthorizationCode, !code.isEmpty { fields["apple_authorization_code"] = code }
        let body = try JSONSerialization.data(withJSONObject: fields)
        let endpoint = Endpoint(path: "/api/account/delete", method: .post, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
    }
}

/// One deletion attempt, including the Apple re-confirmation an Apple account needs (App Review 5.1.1(v)).
///
/// The first request never carries a code: the SERVER says whether this account has an Apple identity (409
/// `apple_authorization_required`), so the app does not guess from what this device remembers. Only then is the person asked to confirm
/// with Apple, and the same request is sent once more with the fresh code. Cancelling the Apple sheet leaves the account untouched.
struct AccountDeletionFlow {
    /// Sends the request: the typed word and, on the second attempt of an Apple account, the single-use authorization code.
    let send: (_ confirm: String, _ appleAuthorizationCode: String?) async throws -> Void
    /// Asks the person to confirm with Apple again. Returns the code, or nil when they cancelled.
    let reauthorize: () async throws -> String?

    func run(confirm word: String) async -> AccountDeletionOutcome {
        do {
            try await send(word, nil)
            return .deleted
        } catch {
            let first = AccountDeletionOutcome.from(.failure(error))
            guard first == .appleAuthorizationRequired else { return first }
        }

        let reconfirmed: String?
        do { reconfirmed = try await reauthorize() } catch { return .failed }
        guard let code = reconfirmed, !code.isEmpty else { return .appleAuthorizationRequired }   // cancelled: nothing was sent, nothing deleted

        do {
            try await send(word, code)
            return .deleted
        } catch {
            return AccountDeletionOutcome.from(.failure(error), appleCodeSent: true)
        }
    }
}
