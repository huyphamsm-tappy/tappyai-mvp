import XCTest
@testable import TappyAI

/// How long the chat stream may stay silent, and what a silence that long is called (iOS audit bug 7, gaps G15 and G26).
/// `URLRequest.timeoutInterval` is the time without a single byte. 60 s cut a reply that was still being thought through (the
/// server may stay silent for a Think step or most of a Deep Research run) and called it «no connection». The web reads a stream
/// silent for 130 s as dead (320 s for Deep Research), and a timeout is not the same thing as being offline.
@MainActor
final class ChatStreamTimeoutTests: XCTestCase {

    private func request(deepResearch: Bool?) -> Endpoint? {
        let streaming = SequencedChatStreaming([])
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        let messages = [MessagePayload(role: "user", content: "Chào")]
        if let deepResearch {
            _ = service.chatWithContext(messages: messages, userPreferences: nil, responseStyle: nil, deepResearch: deepResearch)
        } else {
            _ = service.chatWithContext(messages: messages, userPreferences: nil, responseStyle: nil)
        }
        return streaming.sentEndpoints.first
    }

    func testAChatTurnMayStaySilentFor130Seconds() {
        XCTAssertEqual(request(deepResearch: nil)?.timeout, 130)
        XCTAssertEqual(request(deepResearch: false)?.timeout, 130)
    }

    func testADeepResearchTurnMayStaySilentFor320Seconds() {
        XCTAssertEqual(request(deepResearch: true)?.timeout, 320)
    }

    func testTheConstantsAreTheWebs() {
        XCTAssertEqual(ChatStreamTimeout.standard, 130)
        XCTAssertEqual(ChatStreamTimeout.deepResearch, 320)
    }

    // MARK: A timeout is not «offline»

    private func transportError(_ code: Int) -> NSError {
        NSError(domain: NSURLErrorDomain, code: code)
    }

    func testAStreamTimeoutIsNotOffline() {
        XCTAssertEqual(URLSessionAPIClient.mapStreamTransport(transportError(NSURLErrorTimedOut)), .streaming(reason: "timeout"))
    }

    func testTheOtherStreamTransportErrorsKeepTheirMeaning() {
        XCTAssertEqual(URLSessionAPIClient.mapStreamTransport(transportError(NSURLErrorNotConnectedToInternet)), .offline)
        XCTAssertEqual(URLSessionAPIClient.mapStreamTransport(transportError(NSURLErrorNetworkConnectionLost)), .offline)
        XCTAssertEqual(URLSessionAPIClient.mapStreamTransport(transportError(NSURLErrorCancelled)), .cancellation)
        XCTAssertEqual(URLSessionAPIClient.mapStreamTransport(CancellationError()), .cancellation)
    }

    func testARequestTimeoutOutsideTheStreamStaysOffline() {
        // Only the stream path changed: a plain request that timed out is still reported the way it was.
        XCTAssertEqual(URLSessionAPIClient.mapTransport(transportError(NSURLErrorTimedOut)), .offline)
    }

    func testAChatThatTimedOutIsARetriableErrorAndNotTheOfflineOne() async {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        let vm = ChatViewModel(
            service: ChatService(api: MockAPIClient(), streaming: FailingChatStreaming(error: AppError.streaming(reason: "timeout"))),
            session: session)
        vm.inputText = "Hỏi"
        vm.send()
        await waitUntil { !vm.isStreaming }
        XCTAssertEqual(vm.error, .generic)
        XCTAssertNotEqual(vm.error, .offline, "a silent stream is not a missing connection")
        XCTAssertTrue(vm.error?.isRetriable == true)
    }
}
