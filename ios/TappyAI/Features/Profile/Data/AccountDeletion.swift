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

    static func from(_ result: Result<Void, Error>) -> AccountDeletionOutcome {
        switch result {
        case .success: return .deleted
        case .failure(let error):
            switch error as? AppError {
            case .network(409, _)?: return .staffAccount
            case .network(404, _)?: return .notAvailable
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
        case .deleted, .notAvailable: return nil
        }
    }
}

struct AccountDeletionService {
    let api: APIClient

    /// `POST /api/account/delete {"confirm": word}`. Throws the mapped `AppError` on failure.
    func requestSelfDeletion(confirm word: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["confirm": word])
        let endpoint = Endpoint(path: "/api/account/delete", method: .post, body: body, requiresAuth: true)
        _ = try await api.send(endpoint)
    }
}
