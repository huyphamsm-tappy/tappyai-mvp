import Foundation

enum HTTPMethod: String, Sendable {
    case get = "GET", post = "POST", put = "PUT", delete = "DELETE", patch = "PATCH"
}

/// A transport-level description of one backend call. Endpoint-SPECIFIC definitions are NOT
/// created in Phase 0 — this is the generic shape feature repositories will build against (docs/ios/04).
struct Endpoint: Sendable {
    var path: String                 // e.g. "/api/reviews/feed" (leading slash)
    var method: HTTPMethod = .get
    var query: [URLQueryItem] = []
    var headers: [String: String] = [:]
    var body: Data? = nil
    /// Whether the auth interceptor should attach `Authorization: Bearer`.
    var requiresAuth: Bool = false
    /// Per-request timeout override (seconds); nil uses the client default.
    var timeout: TimeInterval? = nil
    var contentType: String? = "application/json"
}

/// Builds a `URLRequest` from a base URL + `Endpoint`. Pure/synchronous and unit-testable.
struct RequestBuilder {
    let baseURL: URL
    let defaultTimeout: TimeInterval

    init(baseURL: URL, defaultTimeout: TimeInterval = 30) {
        self.baseURL = baseURL
        self.defaultTimeout = defaultTimeout
    }

    func makeRequest(_ endpoint: Endpoint) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(endpoint.path),
                                             resolvingAgainstBaseURL: false) else {
            throw AppError.unexpected(message: "Invalid URL for \(endpoint.path)")
        }
        if !endpoint.query.isEmpty { components.queryItems = endpoint.query }
        guard let url = components.url else {
            throw AppError.unexpected(message: "Invalid components for \(endpoint.path)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.timeoutInterval = endpoint.timeout ?? defaultTimeout
        request.httpBody = endpoint.body
        if let contentType = endpoint.contentType, endpoint.body != nil {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }

        // The APP language, not the device's.
        //
        // 🚨 URLSession sets `Accept-Language` on its own, from `Locale.preferredLanguages` — the
        // DEVICE's languages. Those differ from the app's exactly when it matters most: a user
        // who chose English inside a Vietnamese phone. The backend localizes several responses
        // from this header (`/api/deals`, `/api/reviews/feed`, and — the one that matters —
        // `POST /api/reviews`, whose response tells an author their post was held), so leaving
        // URLSession's default in place meant an English user could be told in Vietnamese why
        // their video is not public.
        //
        // Set here rather than per call site so no future endpoint has to remember. Android does
        // the same thing with an OkHttp interceptor; this is the same fix at the same layer.
        // An endpoint that sets its own header still wins — the loop below runs afterwards.
        request.setValue(LocalizationManager.currentLanguageCode, forHTTPHeaderField: "Accept-Language")

        for (k, v) in endpoint.headers { request.setValue(v, forHTTPHeaderField: k) }
        return request
    }
}
