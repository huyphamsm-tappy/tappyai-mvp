import XCTest
@testable import TappyAI

/// ADR-024 continuation (client half): the decision-evidence KEY is echoed back on the next turn as
/// `decisionEvidenceId` in the request body, and the `X-Decision-Evidence-Id` response header is
/// surfaced as a stream frame. The server owns the FACTS; the client only carries the key.
final class ChatServiceEvidenceTests: XCTestCase {

    /// Captures the endpoint chatWithContext builds, and emits a scripted set of frames.
    final class MockStreamingClient: StreamingClient, @unchecked Sendable {
        private(set) var lastEndpoint: Endpoint?
        var framesToEmit: [StreamFrame] = [.done]
        func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
            lastEndpoint = endpoint
            let frames = framesToEmit
            return AsyncThrowingStream { continuation in
                for f in frames { continuation.yield(f) }
                continuation.finish()
            }
        }
    }

    private func bodyDict(_ endpoint: Endpoint?) -> [String: Any] {
        guard let data = endpoint?.body,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }

    func testFollowUpSendsDecisionEvidenceId() {
        let streaming = MockStreamingClient()
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        _ = service.chatWithContext(
            messages: [MessagePayload(role: "user", content: "Trong các lựa chọn trên, chọn giúp mình")],
            userPreferences: nil, responseStyle: nil, userLocation: nil,
            decisionEvidenceId: "ev-123"
        )
        XCTAssertEqual(bodyDict(streaming.lastEndpoint)["decisionEvidenceId"] as? String, "ev-123")
    }

    func testNewConversationSendsNoEvidenceId() {
        let streaming = MockStreamingClient()
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        _ = service.chatWithContext(
            messages: [MessagePayload(role: "user", content: "Tôi muốn mua MacBook Pro 14 M1")],
            userPreferences: nil, responseStyle: nil, userLocation: nil,
            decisionEvidenceId: nil
        )
        XCTAssertNil(bodyDict(streaming.lastEndpoint)["decisionEvidenceId"])
    }

    func testEmptyEvidenceIdIsNotSent() {
        let streaming = MockStreamingClient()
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        _ = service.chatWithContext(
            messages: [MessagePayload(role: "user", content: "x")],
            userPreferences: nil, responseStyle: nil, userLocation: nil,
            decisionEvidenceId: ""
        )
        XCTAssertNil(bodyDict(streaming.lastEndpoint)["decisionEvidenceId"])
    }

    func testResponseHeaderFrameIsDeliveredToTheCaller() async throws {
        let streaming = MockStreamingClient()
        streaming.framesToEmit = [.decisionEvidenceId("ev-from-header"), .text("ok"), .done]
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        var captured: String?
        for try await frame in service.chatWithContext(
            messages: [MessagePayload(role: "user", content: "hi")],
            userPreferences: nil, responseStyle: nil, userLocation: nil, decisionEvidenceId: nil
        ) {
            if case let .decisionEvidenceId(id) = frame { captured = id }
        }
        XCTAssertEqual(captured, "ev-from-header")
    }
}
