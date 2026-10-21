import XCTest
@testable import TappyAI

/// Phase K (web parity, server is the authority): the two refusals of `POST /api/chat` that iOS used to
/// misreport.
///  · `429 plan_limit_reached` — a PAID plan spent its daily questions. It fell into the generic, RETRIABLE
///    state, so the person was invited to retry something the server will refuse until tomorrow.
///  · `403 ai_consent_required` — no current AI-sharing agreement on the server (`AI_DATA_CONSENT_VERSION` 2).
///    It fell into `.forbidden` → «sign in», sending a signed-in person to the login screen.
/// Neither is decided on the client: only the server's code and its localized sentence are used.
final class ChatQuotaConsentErrorTests: XCTestCase {

    private func http(_ status: Int, _ json: String) -> AppError {
        URLSessionAPIClient.mapHTTP(status: status, data: Data(json.utf8))
    }

    func testPlanLimitCarriesTheServersSentence() {
        let body = #"{"error":"plan_limit_reached","message":"Bạn đã dùng hết 30 câu hỏi của gói Plus hôm nay."}"#
        XCTAssertEqual(http(429, body),
                       .authentication(reason: .planLimitReached(message: "Bạn đã dùng hết 30 câu hỏi của gói Plus hôm nay.")))
        XCTAssertEqual(http(429, #"{"error":"plan_limit_reached"}"#), .authentication(reason: .planLimitReached(message: nil)))
    }

    func testAiConsentRequiredIsNotASignInProblem() {
        let body = #"{"error":"ai_consent_required","message":"Cần đồng ý chia sẻ dữ liệu với AI trong ứng dụng TappyAI trên iPhone để dùng tính năng này."}"#
        XCTAssertEqual(http(403, body),
                       .authentication(reason: .aiConsentRequired(message: "Cần đồng ý chia sẻ dữ liệu với AI trong ứng dụng TappyAI trên iPhone để dùng tính năng này.")))
        XCTAssertNotEqual(http(403, body), .authentication(reason: .forbidden))
    }

    func testTheCodeAloneDecidesNotTheStatus() {
        // A plan-limit code on another status, or a consent code on 429, is not these states.
        XCTAssertNotEqual(http(500, #"{"error":"plan_limit_reached"}"#), .authentication(reason: .planLimitReached(message: nil)))
        XCTAssertNotEqual(http(429, #"{"error":"ai_consent_required"}"#), .authentication(reason: .aiConsentRequired(message: nil)))
    }

    func testTheExistingMappingsAreUnchanged() {
        XCTAssertEqual(http(429, #"{"error":"free_limit_reached"}"#), .authentication(reason: .freeLimitReached))
        XCTAssertEqual(http(401, #"{"error":"anon_limit_reached"}"#), .authentication(reason: .anonLimitReached))
        XCTAssertEqual(http(403, #"{"error":"forbidden"}"#), .authentication(reason: .forbidden))
        XCTAssertEqual(http(403, #"{"error":"age_ineligible"}"#), .authentication(reason: .ageGate(code: "age_ineligible", message: nil)))
        XCTAssertEqual(http(429, #"{"error":"rate_limit"}"#), .network(status: 429, code: "rate_limit"))
    }

    func testAPlanLimitIsAKnownLimitSoItIsNeverRetriedByTheClient() {
        XCTAssertTrue(URLSessionAPIClient.isKnownLimit(status: 429, data: Data(#"{"error":"plan_limit_reached"}"#.utf8)))
        XCTAssertTrue(URLSessionAPIClient.isKnownLimit(status: 429, data: Data(#"{"error":"free_limit_reached"}"#.utf8)))
        XCTAssertFalse(URLSessionAPIClient.isKnownLimit(status: 429, data: Data(#"{"error":"rate_limit"}"#.utf8)))
    }

    func testChatMapsThemToTheirOwnNonRetriableStates() {
        let plan = ChatViewModel.mapError(AppError.authentication(reason: .planLimitReached(message: "m")))
        XCTAssertEqual(plan, .planLimitReached(message: "m"))
        XCTAssertFalse(plan.isRetriable, "retrying a spent plan only repeats the refusal")

        let consent = ChatViewModel.mapError(AppError.authentication(reason: .aiConsentRequired(message: "m")))
        XCTAssertEqual(consent, .aiConsentRequired(message: "m"))
        XCTAssertFalse(consent.isRetriable)
        XCTAssertNotEqual(consent, .authRequired, "a signed-in person is not sent to the login screen")
        XCTAssertFalse(consent.locksInput, "only the under-18 block locks the input")
    }

    func testAPlanLimitIsNotAResumeAfterLoginCase() {
        XCTAssertFalse(ChatViewModel.shouldResumeAfterLogin(error: .planLimitReached(message: nil), lastIsUser: true,
                                                            isStreaming: false, signedIn: true))
        XCTAssertFalse(ChatViewModel.shouldResumeAfterLogin(error: .aiConsentRequired(message: nil), lastIsUser: true,
                                                            isStreaming: false, signedIn: true))
    }

    func testTheGenericPresenterUsesTheServerSentenceOrItsOwnFallback() {
        let withMessage = ErrorPresenter.present(.authentication(reason: .planLimitReached(message: "Hết lượt hôm nay")))
        XCTAssertEqual(withMessage.message, "Hết lượt hôm nay")
        let fallback = ErrorPresenter.present(.authentication(reason: .aiConsentRequired(message: nil)))
        XCTAssertFalse(fallback.message.isEmpty)
    }
}
