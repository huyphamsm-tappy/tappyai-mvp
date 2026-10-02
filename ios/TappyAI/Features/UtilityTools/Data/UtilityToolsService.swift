import Foundation

struct RatesResponse: Decodable {
    let rates: [String: Double]
    let date: String?
    let fallback: Bool

    enum CodingKeys: String, CodingKey { case rates, date, fallback }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // A currency whose value is not a number drops that currency, not the converter.
        let raw = c.lenient([String: LossyElement<Double>].self, forKey: .rates) ?? [:]
        rates = raw.compactMapValues(\.value)
        date = c.lenient(String.self, forKey: .date)
        fallback = c.lenient(Bool.self, forKey: .fallback, default: false)
    }
}

// The result IS the payload for these three: without it there is nothing to show, so it stays
// required and the screen shows its own error (not a decode crash) when it is missing.
struct TranslateResponse: Decodable {
    let translation: String
}

struct ScanResponse: Decodable {
    let text: String
}

struct VietContentResponse: Decodable {
    let caption: String
    let hashtags: String

    enum CodingKeys: String, CodingKey { case caption, hashtags }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        caption = try c.decode(String.self, forKey: .caption)
        // "#a #b" today; a list tomorrow would still read as the same line.
        hashtags = c.lenient(String.self, forKey: .hashtags)
            ?? c.lossyArray(String.self, forKey: .hashtags).joined(separator: " ")
    }
}

final class UtilityToolsService: Sendable {
    private let api: APIClient
    /// Asked before translate / scan / write-content send anything to the AI provider (App Review 5.1.2(i)).
    private let consent: AIConsentCoordinator?

    init(api: APIClient, consent: AIConsentCoordinator? = nil) {
        self.api = api
        self.consent = consent
    }

    /// «Để sau» = the request is not made, and the screen shows the plain «agree to use this» line.
    private func requireConsent() async throws {
        if let consent, !(await consent.ensure()) { throw AIConsentStore.blockedError }
    }

    func fetchRates() async throws -> RatesResponse {
        let endpoint = Endpoint(path: "/api/rates", method: .get)
        return try await api.send(endpoint, as: RatesResponse.self)
    }

    func translate(text: String, targetLang: String) async throws -> TranslateResponse {
        try await requireConsent()
        let body = try JSONSerialization.data(withJSONObject: [
            "text": text,
            "targetLang": targetLang
        ])
        let endpoint = Endpoint(path: "/api/translate", method: .post, body: body)
        return try await api.send(endpoint, as: TranslateResponse.self)
    }

    func scan(imageBase64: String, mimeType: String) async throws -> ScanResponse {
        try await requireConsent()
        let body = try JSONSerialization.data(withJSONObject: [
            "imageBase64": imageBase64,
            "mimeType": mimeType
        ])
        let endpoint = Endpoint(path: "/api/scan", method: .post, body: body, timeout: 60)
        return try await api.send(endpoint, as: ScanResponse.self)
    }

    func generateVietContent(topic: String, platform: String, tone: String, length: String) async throws -> VietContentResponse {
        try await requireConsent()
        let body = try JSONSerialization.data(withJSONObject: [
            "topic": topic,
            "platform": platform,
            "tone": tone,
            "length": length
        ])
        let endpoint = Endpoint(path: "/api/viet-content", method: .post, body: body)
        return try await api.send(endpoint, as: VietContentResponse.self)
    }

    /// Scam Shield (B09). `requiresAuth` so a signed-in user gets the higher daily quota the
    /// backend grants them — exactly as on the web, where the same endpoint reads the session.
    ///
    /// 🚨 No local scoring: this sends the URL and returns whatever verdict the backend produced.
    /// The engine, the provider fan-out, the official-brand directory and the thresholds all stay
    /// on the server.
    /// Scam Shield · message, SERVER half (AI-assisted). Asks for the person's AI consent first, then sends the pasted
    /// text and NOTHING else. 🚨 Never called for a message the on-device matcher could already name.
    func analyzeScamMessage(text: String) async throws -> ScamMessageAnalysis {
        try await requireConsent()
        let body = try JSONSerialization.data(withJSONObject: ["text": String(text.prefix(ScamMessageMatcher.maxChars * 2))])
        let endpoint = Endpoint(path: "/api/scam-shield/analyze", method: .post, body: body, requiresAuth: true, timeout: 45)
        return try await api.send(endpoint, as: ScamMessageAnalysis.self)
    }

    func checkScamShield(url: String) async throws -> ScamCheckResult {
        let body = try JSONSerialization.data(withJSONObject: ["url": url])
        let endpoint = Endpoint(path: "/api/scam-shield/check", method: .post, body: body,
                                requiresAuth: true, timeout: 20)
        return try await api.send(endpoint, as: ScamCheckResult.self)
    }
}
