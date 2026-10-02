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

    // MARK: Message check (on-device first)

    @AppPublished var messageText = ""
    /// The on-device reading of `messageText`. Set by `checkMessage()`; nothing is sent anywhere to produce it.
    @AppPublished var messageOutcome: ScamMessageOutcome?
    /// The server (AI-assisted) analysis — only after the person asked for it and agreed to share data with AI.
    @AppPublished var messageAnalysis: ScamMessageAnalysis?
    @AppPublished var messageAnalyzing = false
    /// Set when the deeper analysis could not be done (not signed in, server without it, quota, offline…). Localized.
    @AppPublished var messageAnalysisFailure: String?

    var canCheckMessage: Bool { !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    /// Reads the pasted text against the bundled scenarios. Pure and offline: never a request, never stored.
    func checkMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messageAnalysis = nil
        messageAnalysisFailure = nil
        messageOutcome = ScamMessageMatcher.analyze(text)
    }

    /// «Phân tích sâu hơn»: the server analysis. 🚨 The consent sheet comes first (inside the service); a «Để sau» sends nothing.
    func analyzeMessageDeeper() async {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !messageAnalyzing else { return }
        messageAnalyzing = true
        messageAnalysisFailure = nil
        defer { messageAnalyzing = false }
        do {
            let analysis = try await service.analyzeScamMessage(text: text)
            if analysis.isUsable { messageAnalysis = analysis }
            else { messageAnalysisFailure = NSLocalizedString("scam.msg.deeper.failed", comment: "") }
        } catch let appError as AppError {
            messageAnalysisFailure = Self.messageFailure(for: appError)
        } catch {
            messageAnalysisFailure = NSLocalizedString("scam.msg.deeper.failed", comment: "")
        }
    }

    func clearMessage() {
        messageText = ""
        messageOutcome = nil
        messageAnalysis = nil
        messageAnalysisFailure = nil
    }

    static func messageFailure(for error: AppError) -> String {
        switch error {
        case .offline: return NSLocalizedString("scamShield.error.offline", comment: "")
        case .validation: return NSLocalizedString("ai.consent.needed", comment: "")      // «Để sau»: nothing was sent
        case .authentication(let reason):
            switch reason {
            case .anonLimitReached, .freeLimitReached: return NSLocalizedString("scam.msg.deeper.quota", comment: "")
            default: return NSLocalizedString("scam.msg.deeper.failed", comment: "")
            }
        case .network(let status, let code):
            if status == 429 || code == "rate_limit" { return NSLocalizedString("scamShield.error.rateLimit", comment: "") }
            if status == 404 { return NSLocalizedString("scam.msg.deeper.unavailable", comment: "") }   // a server without it yet
            return NSLocalizedString("scam.msg.deeper.failed", comment: "")
        default: return NSLocalizedString("scam.msg.deeper.failed", comment: "")
        }
    }

    // MARK: QR (decoded on the phone; only a LINK ever goes on, and only its text)

    @AppPublished var qrPayload: QRPayload?
    /// «Nothing found in this picture», shown plainly. Localized.
    @AppPublished var qrMessage: String?
    /// The link check was started FROM a QR code (so the result says where the link came from).
    @AppPublished var linkFromQR = false

    /// Takes whatever the camera or the picture decoded. A link starts the link check; any other kind is only named.
    func handleQR(texts: [String]) async {
        qrMessage = nil
        guard let first = texts.first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
            qrPayload = nil
            qrMessage = NSLocalizedString("scam.qr.none", comment: "")
            return
        }
        let payload = QRPayload.classify(first)
        qrPayload = payload
        if case .link(let link) = payload {
            url = link
            linkFromQR = true
            await check()
        }
    }

    func clearQR() {
        qrPayload = nil
        qrMessage = nil
        if linkFromQR { clear() }
        linkFromQR = false
    }

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
