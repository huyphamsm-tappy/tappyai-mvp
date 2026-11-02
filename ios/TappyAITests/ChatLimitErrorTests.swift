import XCTest
@testable import TappyAI

/// The three 429 refusals of `POST /api/chat` that iOS reported as a generic network failure (iOS audit gap G13):
///  · `deep_research_limit_reached` — the plan's Deep Research reports for the month are spent;
///  · `pro_daily_limit_reached`     — the hidden daily cost ceiling of a paid account;
///  · `rate_limit`                  — too many requests in a minute.
/// Each comes with the server's own sentence (already in the request language); only the code and that sentence are used.
@MainActor
final class ChatLimitErrorTests: XCTestCase {

    private func http(_ status: Int, _ json: String) -> AppError {
        URLSessionAPIClient.mapHTTP(status: status, data: Data(json.utf8))
    }

    private func chatHTTP(_ status: Int, _ json: String) -> AppError {
        URLSessionAPIClient.mapChatHTTP(status: status, data: Data(json.utf8))
    }

    func testDeepResearchLimitCarriesTheServersSentence() {
        let body = #"{"error":"deep_research_limit_reached","message":"Bạn đã dùng hết 10 báo cáo Nghiên cứu sâu của tháng này."}"#
        XCTAssertEqual(http(429, body),
                       .authentication(reason: .deepResearchLimitReached(message: "Bạn đã dùng hết 10 báo cáo Nghiên cứu sâu của tháng này.")))
        XCTAssertEqual(http(429, #"{"error":"deep_research_limit_reached"}"#),
                       .authentication(reason: .deepResearchLimitReached(message: nil)))
    }

    func testProDailyLimitCarriesTheServersSentence() {
        let body = #"{"error":"pro_daily_limit_reached","message":"Hôm nay bạn đã hỏi rất nhiều rồi, mai quay lại nhé."}"#
        XCTAssertEqual(http(429, body),
                       .authentication(reason: .proDailyLimitReached(message: "Hôm nay bạn đã hỏi rất nhiều rồi, mai quay lại nhé.")))
    }

    func testTheChatPathReadsTheBurstLimitWithItsSentence() {
        XCTAssertEqual(chatHTTP(429, #"{"error":"rate_limit","message":"Bạn gửi hơi nhanh, chờ một chút nhé."}"#),
                       .authentication(reason: .rateLimited(message: "Bạn gửi hơi nhanh, chờ một chút nhé.")))
        XCTAssertEqual(chatHTTP(429, #"{"error":"rate_limit"}"#), .authentication(reason: .rateLimited(message: nil)))
    }

    func testOtherEndpointsKeepReadingTheBurstLimitAsANetworkCode() {
        // Scam Shield and the others look at `.network(429, "rate_limit")`; only the chat path changed.
        XCTAssertEqual(http(429, #"{"error":"rate_limit"}"#), .network(status: 429, code: "rate_limit"))
    }

    func testTheChatPathLeavesEveryOtherAnswerToTheSharedMapping() {
        XCTAssertEqual(chatHTTP(429, #"{"error":"free_limit_reached"}"#), .authentication(reason: .freeLimitReached))
        XCTAssertEqual(chatHTTP(429, #"{"error":"plan_limit_reached","message":"m"}"#),
                       .authentication(reason: .planLimitReached(message: "m")))
        XCTAssertEqual(chatHTTP(500, #"{"error":"boom"}"#), .network(status: 500, code: "boom"))
        // The code alone decides, but only on 429.
        XCTAssertNotEqual(chatHTTP(500, #"{"error":"rate_limit"}"#), .authentication(reason: .rateLimited(message: nil)))
    }

    func testTheThreeAreKnownLimitsSoTheClientNeverRetriesThem() {
        for code in ["deep_research_limit_reached", "pro_daily_limit_reached", "rate_limit"] {
            XCTAssertTrue(URLSessionAPIClient.isKnownLimit(status: 429, data: Data("{\"error\":\"\(code)\"}".utf8)), code)
        }
        XCTAssertFalse(URLSessionAPIClient.isKnownLimit(status: 429, data: Data(#"{"error":"something_else"}"#.utf8)))
    }

    func testChatMapsThemToTheirOwnStates() {
        XCTAssertEqual(ChatViewModel.mapError(AppError.authentication(reason: .deepResearchLimitReached(message: "m"))),
                       .deepResearchLimit(message: "m"))
        XCTAssertEqual(ChatViewModel.mapError(AppError.authentication(reason: .proDailyLimitReached(message: "m"))),
                       .proDailyLimit(message: "m"))
        XCTAssertEqual(ChatViewModel.mapError(AppError.authentication(reason: .rateLimited(message: "m"))),
                       .rateLimited(message: "m"))
        XCTAssertFalse(ChatError.deepResearchLimit(message: nil).isRetriable, "retrying a spent month only repeats the refusal")
        XCTAssertFalse(ChatError.proDailyLimit(message: nil).isRetriable)
    }

    func testTheServersSentenceIsShownAndTheAppsOwnIsTheFallback() {
        XCTAssertEqual(ChatError.deepResearchLimit(message: "Câu của máy chủ").limitSentence, "Câu của máy chủ")
        XCTAssertEqual(ChatError.rateLimited(message: "Chờ chút").limitSentence, "Chờ chút")
        for error: ChatError in [.deepResearchLimit(message: nil), .proDailyLimit(message: nil), .rateLimited(message: nil)] {
            let sentence = error.limitSentence ?? ""
            XCTAssertFalse(sentence.isEmpty, "\(error)")
            XCTAssertFalse(sentence.hasPrefix("chat.error."), "the key must resolve to a sentence: \(sentence)")
        }
        XCTAssertNil(ChatError.generic.limitSentence)
    }

    func testAChatRefusedWithADeepResearchLimitShowsItsStateAndNoRetry() async {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        let refusal = AppError.authentication(reason: .deepResearchLimitReached(message: "Hết lượt tháng này"))
        let vm = ChatViewModel(service: ChatService(api: MockAPIClient(), streaming: FailingChatStreaming(error: refusal)), session: session)
        vm.inputText = "Nghiên cứu giúp"
        vm.send()
        await waitUntil { !vm.isStreaming }
        XCTAssertEqual(vm.error, .deepResearchLimit(message: "Hết lượt tháng này"))
        XCTAssertFalse(vm.messages.contains { $0.isAssistant }, "no empty reply next to the refusal")
    }
}
