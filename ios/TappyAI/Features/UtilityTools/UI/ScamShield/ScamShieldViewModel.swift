import SwiftUI

/// State for the Scam Shield screen (`/scam-shield` on the web) — B09.
///
/// 🚨 `result` can only be set from a backend verdict. Every failure path sets `failure` instead,
/// and the view renders that as "we couldn't check this link" — never as an absence of risk. That
/// fail-closed behaviour is the whole reason the feature exists: a link the app could not check is
/// not a link the app has cleared.
@MainActor
final class ScamShieldViewModel: AppObservableObject {
    @AppPublished var url = ""
    @AppPublished var loading = false
    @AppPublished var result: ScamCheckResult?
    /// Set instead of `result` whenever no verdict was obtained. Already localized.
    @AppPublished var failure: String?

    private let service: UtilityToolsService

    init(service: UtilityToolsService) {
        self.service = service
    }

    var canCheck: Bool {
        !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !loading
    }

    func check() async {
        let target = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !target.isEmpty, !loading else { return }

        loading = true
        result = nil
        failure = nil

        do {
            result = try await service.checkScamShield(url: target)
        } catch let appError as AppError {
            failure = Self.message(for: appError)
        } catch {
            failure = NSLocalizedString("scamShield.error.generic", comment: "")
        }
        loading = false
    }

    func clear() {
        url = ""
        result = nil
        failure = nil
    }

    /// Maps the shared client's error into something the user can act on.
    ///
    /// A 400 carries the backend's own `message`, which arrives already in the app's language
    /// (RequestBuilder sends Accept-Language), and says something specific a generic local string
    /// cannot. Everything else falls back to the catalogue by the `error` code the body carried.
    static func message(for error: AppError) -> String {
        switch error {
        case .offline:
            return NSLocalizedString("scamShield.error.offline", comment: "")
        case .validation(let message):
            return message.isEmpty ? NSLocalizedString("scamShield.error.invalidUrl", comment: "") : message
        case .network(_, let code):
            switch code {
            case "rate_limit": return NSLocalizedString("scamShield.error.rateLimit", comment: "")
            case "daily_limit": return NSLocalizedString("scamShield.error.dailyLimit", comment: "")
            case "private_url": return NSLocalizedString("scamShield.error.privateUrl", comment: "")
            case "invalid_input", "invalid_body": return NSLocalizedString("scamShield.error.invalidUrl", comment: "")
            default: return NSLocalizedString("scamShield.error.generic", comment: "")
            }
        case .authentication:
            return NSLocalizedString("scamShield.error.dailyLimit", comment: "")
        default:
            return NSLocalizedString("scamShield.error.generic", comment: "")
        }
    }
}
