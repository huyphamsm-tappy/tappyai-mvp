import XCTest
@testable import TappyAI

/// Web 28/11/2026: everything except chatting with Tappy needs an account. A route closed to guests answers 401 `login_required` (no session)
/// or 403 `account_required` (an anonymous guest session). The app turns both into ONE state whose remedy is the sign-in screen, and keeps
/// every other 401/403 exactly as it was (a plain 403 stays `forbidden`, `ai_consent_required` stays its own state).
@MainActor
final class AccountRequiredTests: XCTestCase {

    private func http(_ status: Int, _ json: String) -> AppError {
        URLSessionAPIClient.mapHTTP(status: status, data: Data(json.utf8))
    }

    func testLoginRequiredAndAccountRequiredBecomeTheSameState() {
        let sentence = "Hãy đăng nhập để sử dụng tính năng này."
        XCTAssertEqual(http(401, #"{"error":"login_required","message":"\#(sentence)"}"#),
                       .authentication(reason: .accountRequired(message: sentence)))
        XCTAssertEqual(http(403, #"{"error":"account_required","message":"\#(sentence)"}"#),
                       .authentication(reason: .accountRequired(message: sentence)))
        XCTAssertEqual(http(403, #"{"error":"account_required"}"#), .authentication(reason: .accountRequired(message: nil)))
    }

    func testOtherRefusalsAreUnchanged() {
        XCTAssertEqual(http(401, #"{"error":"unauthorized"}"#), .authentication(reason: .unauthenticated))
        XCTAssertEqual(http(403, #"{"error":"forbidden"}"#), .authentication(reason: .forbidden))
        XCTAssertEqual(http(403, #"{"error":"ai_consent_required"}"#), .authentication(reason: .aiConsentRequired(message: nil)))
        XCTAssertEqual(http(401, #"{"error":"anon_limit_reached"}"#), .authentication(reason: .anonLimitReached))
    }

    func testTheCodeAloneDecidesNotTheStatus() {
        XCTAssertNotEqual(http(500, #"{"error":"account_required"}"#), .authentication(reason: .accountRequired(message: nil)))
    }

    /// A guest reading a closed route does not pop a sign-in screen for a background read; a tap on a write, or a screen opened on purpose, does.
    func testOnlyUserInitiatedCallsAnnounceTheSignIn() {
        let error = AppError.authentication(reason: .accountRequired(message: nil))
        var posted = 0
        let token = NotificationCenter.default.addObserver(forName: .accountRequired, object: nil, queue: nil) { _ in posted += 1 }
        defer { NotificationCenter.default.removeObserver(token) }

        _ = URLSessionAPIClient.announceAccountRequired(error, endpoint: Endpoint(path: "/api/favorites", method: .get))
        XCTAssertEqual(posted, 0, "a background read of favorites must not pop the sign-in screen")
        _ = URLSessionAPIClient.announceAccountRequired(error, endpoint: Endpoint(path: "/api/favorites", method: .post))
        XCTAssertEqual(posted, 1, "saving a place is a deliberate tap")
        _ = URLSessionAPIClient.announceAccountRequired(error, endpoint: Endpoint(path: "/api/rates", method: .get))
        XCTAssertEqual(posted, 2, "opening the rates screen is deliberate")
        _ = URLSessionAPIClient.announceAccountRequired(.authentication(reason: .forbidden), endpoint: Endpoint(path: "/api/favorites", method: .post))
        XCTAssertEqual(posted, 2, "only an account-required answer announces")
    }
}
