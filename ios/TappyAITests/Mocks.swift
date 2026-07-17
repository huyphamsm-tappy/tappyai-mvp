import Foundation
@testable import TappyAI

/// Shared test doubles. Feature-specific mocks are added alongside their tests later.

struct MockTokenRefreshing: TokenRefreshing {
    let result: Result<AuthTokens, Error>
    func refresh(_ current: AuthTokens) async throws -> AuthTokens { try result.get() }
}

final class MockAPIClient: APIClient, @unchecked Sendable {
    var stubbed: Data = Data()
    private(set) var sentEndpoints: [Endpoint] = []

    func send(_ endpoint: Endpoint) async throws -> Data {
        sentEndpoints.append(endpoint)
        return stubbed
    }
    func send<T: Decodable>(_ endpoint: Endpoint, as type: T.Type) async throws -> T {
        sentEndpoints.append(endpoint)
        return try ResponseDecoder.json.decode(T.self, from: stubbed)
    }
}

enum TestFixtures {
    /// Builds a fake (unsigned) JWT whose payload carries `sub`, so SessionStore can read the user id.
    static func tokens(expiresIn seconds: TimeInterval, sub: String = "user-1") -> AuthTokens {
        var payload = Data("{\"sub\":\"\(sub)\"}".utf8).base64EncodedString()
        payload = payload.replacingOccurrences(of: "+", with: "-")
                         .replacingOccurrences(of: "/", with: "_")
                         .replacingOccurrences(of: "=", with: "")
        let jwt = "e30.\(payload).sig"
        return AuthTokens(accessToken: jwt, refreshToken: "refresh", expiresAt: Date().addingTimeInterval(seconds))
    }
}
