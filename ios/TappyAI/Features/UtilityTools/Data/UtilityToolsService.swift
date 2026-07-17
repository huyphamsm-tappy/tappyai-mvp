import Foundation

struct RatesResponse: Decodable {
    let rates: [String: Double]
    let date: String?
    let fallback: Bool
}

struct TranslateResponse: Decodable {
    let translation: String
}

struct ScanResponse: Decodable {
    let text: String
}

struct VietContentResponse: Decodable {
    let caption: String
    let hashtags: String
}

final class UtilityToolsService: Sendable {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func fetchRates() async throws -> RatesResponse {
        let endpoint = Endpoint(path: "/api/rates", method: .get)
        return try await api.send(endpoint, as: RatesResponse.self)
    }

    func translate(text: String, targetLang: String) async throws -> TranslateResponse {
        let body = try JSONSerialization.data(withJSONObject: [
            "text": text,
            "targetLang": targetLang
        ])
        let endpoint = Endpoint(path: "/api/translate", method: .post, body: body)
        return try await api.send(endpoint, as: TranslateResponse.self)
    }

    func scan(imageBase64: String, mimeType: String) async throws -> ScanResponse {
        let body = try JSONSerialization.data(withJSONObject: [
            "imageBase64": imageBase64,
            "mimeType": mimeType
        ])
        let endpoint = Endpoint(path: "/api/scan", method: .post, body: body, timeout: 60)
        return try await api.send(endpoint, as: ScanResponse.self)
    }

    func generateVietContent(topic: String, platform: String, tone: String, length: String) async throws -> VietContentResponse {
        let body = try JSONSerialization.data(withJSONObject: [
            "topic": topic,
            "platform": platform,
            "tone": tone,
            "length": length
        ])
        let endpoint = Endpoint(path: "/api/viet-content", method: .post, body: body)
        return try await api.send(endpoint, as: VietContentResponse.self)
    }
}
