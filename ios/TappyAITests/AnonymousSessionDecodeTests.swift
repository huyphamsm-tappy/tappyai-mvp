import XCTest
@testable import TappyAI

/// Locks the STABLE anonymous-session contract shape (survey §0 · D1) so a backend change to the
/// response is caught immediately.
final class AnonymousSessionDecodeTests: XCTestCase {
    func testDecodesContract() throws {
        let json = """
        { "access_token": "a.b.c", "refresh_token": "r", "anonymous_id": "anon-123", "expires_at": 1720000000 }
        """
        let decoded = try JSONDecoder().decode(AnonymousSessionResponse.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.accessToken, "a.b.c")
        XCTAssertEqual(decoded.refreshToken, "r")
        XCTAssertEqual(decoded.anonymousId, "anon-123")
        XCTAssertEqual(decoded.tokens.expiresAt, Date(timeIntervalSince1970: 1720000000))
    }

    func testMissingExpiryFallsBack() throws {
        let json = #"{ "access_token": "a", "refresh_token": "r", "anonymous_id": "x" }"#
        let decoded = try JSONDecoder().decode(AnonymousSessionResponse.self, from: Data(json.utf8))
        XCTAssertGreaterThan(decoded.tokens.expiresAt, Date())
    }
}
