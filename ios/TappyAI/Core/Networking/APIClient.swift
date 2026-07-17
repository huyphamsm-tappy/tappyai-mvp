import Foundation

struct APIResponse: Sendable {
    let data: Data
    let statusCode: Int
    let headers: [String: String]
}

/// The single typed gateway to the Next.js backend (docs/ios/04). Endpoint-specific methods are
/// NOT defined here in Phase 0 — feature repositories compose `Endpoint` values and call `send`.
protocol APIClient: Sendable {
    func send(_ endpoint: Endpoint) async throws -> Data
    func send<T: Decodable>(_ endpoint: Endpoint, as type: T.Type) async throws -> T
    func sendWithResponse(_ endpoint: Endpoint) async throws -> APIResponse
}

extension APIClient {
    func sendWithResponse(_ endpoint: Endpoint) async throws -> APIResponse {
        let data = try await send(endpoint)
        return APIResponse(data: data, statusCode: 200, headers: [:])
    }
}

final class URLSessionAPIClient: APIClient {
    private let builder: RequestBuilder
    private let session: URLSession
    private let auth: AuthInterceptor
    private let retry: RetryPolicy
    private let decoder: JSONDecoder
    private let log = AppLogger.network

    init(baseURL: URL,
         auth: AuthInterceptor,
         session: URLSession = .shared,
         retry: RetryPolicy = .default,
         decoder: JSONDecoder = ResponseDecoder.json,
         defaultTimeout: TimeInterval = 30) {
        self.builder = RequestBuilder(baseURL: baseURL, defaultTimeout: defaultTimeout)
        self.session = session
        self.auth = auth
        self.retry = retry
        self.decoder = decoder
    }

    func send<T: Decodable>(_ endpoint: Endpoint, as type: T.Type) async throws -> T {
        let data = try await send(endpoint)
        do { return try decoder.decode(T.self, from: data) }
        catch { throw AppError.unexpected(message: "Response decoding failed: \(error.localizedDescription)") }
    }

    func send(_ endpoint: Endpoint) async throws -> Data {
        let (data, _) = try await executeRaw(endpoint)
        return data
    }

    func sendWithResponse(_ endpoint: Endpoint) async throws -> APIResponse {
        let (data, http) = try await executeRaw(endpoint)
        let headers = Dictionary(
            http.allHeaderFields.compactMap { key, value -> (String, String)? in
                guard let k = key as? String, let v = value as? String else { return nil }
                return (k.lowercased(), v)
            },
            uniquingKeysWith: { _, last in last }
        )
        return APIResponse(data: data, statusCode: http.statusCode, headers: headers)
    }

    private func executeRaw(_ endpoint: Endpoint) async throws -> (Data, HTTPURLResponse) {
        var request = try builder.makeRequest(endpoint)
        if endpoint.requiresAuth { await auth.authorize(&request) }
        return try await execute(request, endpoint: endpoint, didRetryAuth: false, attempt: 0)
    }

    private func execute(_ request: URLRequest, endpoint: Endpoint,
                         didRetryAuth: Bool, attempt: Int) async throws -> (Data, HTTPURLResponse) {
        try Task.checkCancellation()
        let data: Data, response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw Self.mapTransport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw AppError.network(status: nil, code: nil)
        }

        switch http.statusCode {
        case 200...299:
            return (data, http)

        case 401 where endpoint.requiresAuth && !didRetryAuth:
            if let retried = await auth.retryAfterUnauthorized(request) {
                return try await execute(retried, endpoint: endpoint, didRetryAuth: true, attempt: attempt)
            }
            throw Self.mapHTTP(status: 401, data: data)

        default:
            if retry.shouldRetry(status: http.statusCode, attempt: attempt),
               !Self.isKnownLimit(status: http.statusCode, data: data) {
                let delay = retry.delay(forAttempt: attempt)
                log.debug("retry \(endpoint.path) status=\(http.statusCode) attempt=\(attempt) in \(delay)s")
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                return try await execute(request, endpoint: endpoint, didRetryAuth: didRetryAuth, attempt: attempt + 1)
            }
            throw Self.mapHTTP(status: http.statusCode, data: data)
        }
    }

    // MARK: - Error mapping

    static func mapTransport(_ error: Error) -> AppError {
        if error is CancellationError { return .cancellation }
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain {
            switch ns.code {
            case NSURLErrorCancelled: return .cancellation
            case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost,
                 NSURLErrorDataNotAllowed, NSURLErrorTimedOut:
                return .offline
            default: return .network(status: nil, code: nil)
            }
        }
        return .network(status: nil, code: nil)
    }

    static func mapHTTP(status: Int, data: Data) -> AppError {
        let code = errorCode(from: data)
        switch (status, code) {
        case (_, "anon_limit_reached"): return .authentication(reason: .anonLimitReached)
        case (_, "free_limit_reached"): return .authentication(reason: .freeLimitReached)
        case (400, _): return .validation(message: errorMessage(from: data) ?? "Invalid request")
        case (401, _): return .authentication(reason: .unauthenticated)
        case (403, _): return .authentication(reason: .forbidden)
        default: return .network(status: status, code: code)
        }
    }

    static func isKnownLimit(status: Int, data: Data) -> Bool {
        let code = errorCode(from: data)
        return code == "free_limit_reached" || code == "anon_limit_reached"
    }

    private static func errorCode(from data: Data) -> String? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return (obj["error"] as? String) ?? (obj["code"] as? String)
    }
    private static func errorMessage(from data: Data) -> String? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return (obj["message"] as? String) ?? (obj["error"] as? String)
    }
}
