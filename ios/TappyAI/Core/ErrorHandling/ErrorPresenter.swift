import SwiftUI

/// Maps `AppError` to user-facing, localized presentation. Keeps copy out of feature code.
/// Localization keys resolve against the String Catalog (see LocalizationManager); English fallbacks inline.
enum ErrorPresenter {
    struct Presentation {
        let title: String
        let message: String
        let retryable: Bool
    }

    static func present(_ error: AppError) -> Presentation {
        switch error {
        case .offline:
            return .init(title: L("error.offline.title", "You're offline"),
                         message: L("error.offline.message", "Check your connection and try again."),
                         retryable: true)
        case .network:
            return .init(title: L("error.network.title", "Something went wrong"),
                         message: L("error.network.message", "Please try again in a moment."),
                         retryable: true)
        case .streaming:
            return .init(title: L("error.stream.title", "Response interrupted"),
                         message: L("error.stream.message", "The reply was interrupted. Try again."),
                         retryable: true)
        case .validation(let message):
            return .init(title: L("error.validation.title", "Check your input"),
                         message: message, retryable: false)
        case .authentication(let reason):
            return .init(title: L("error.auth.title", "Please sign in"),
                         message: authMessage(reason), retryable: false)
        case .cancellation:
            return .init(title: "", message: "", retryable: false)
        case .unexpected(let message):
            return .init(title: L("error.unexpected.title", "Unexpected error"),
                         message: message, retryable: true)
        }
    }

    private static func authMessage(_ reason: AppError.AuthFailure) -> String {
        switch reason {
        case .anonLimitReached: return L("error.auth.anonLimit", "Sign in to keep chatting with Tappy.")
        case .freeLimitReached: return L("error.auth.freeLimit", "You've reached today's limit. Come back tomorrow.")
        case .forbidden:        return L("error.auth.forbidden", "You don't have access to this.")
        default:                return L("error.auth.generic", "Please sign in to continue.")
        }
    }

    /// Localization helper — resolves a key, falling back to the provided English default.
    private static func L(_ key: String, _ fallback: String) -> String {
        let value = NSLocalizedString(key, comment: "")
        return value == key ? fallback : value
    }
}
