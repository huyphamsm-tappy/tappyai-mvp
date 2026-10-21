import XCTest
@testable import TappyAI

/// ADR-024, the iOS half (Phase L). Production `/api/chat` answers a shopping turn with an
/// `X-Decision-Evidence-Id` header and reads the conversation's next body field `decisionEvidenceId`.
/// These tests pin: the key is echoed only when it exists, it is never a fact, and the header is
/// surfaced as a frame. Web: `ChatInterface.tsx` `onResponse`. Android: `DecisionEvidenceKeysTest`.
final class ChatServiceEvidenceTests: XCTestCase {

    /// Captures the endpoint the service builds, without touching the network.
    private final class CapturingStreaming: StreamingClient, @unchecked Sendable {
        var endpoint: Endpoint?
        func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
            self.endpoint = endpoint
            return AsyncThrowingStream { $0.finish() }
        }
    }

    private func bodyJSON(_ streaming: CapturingStreaming) throws -> [String: Any] {
        let body = try XCTUnwrap(streaming.endpoint?.body)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    }

    private func send(decisionEvidenceId: String?) throws -> [String: Any] {
        let streaming = CapturingStreaming()
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        _ = service.chatWithContext(
            messages: [MessagePayload(role: "user", content: "Mua tai nghe nào?")],
            userPreferences: nil,
            responseStyle: nil,
            decisionEvidenceId: decisionEvidenceId
        )
        return try bodyJSON(streaming)
    }

    func testAFollowUpEchoesTheKeyTheServerGave() throws {
        let body = try send(decisionEvidenceId: "0f8fad5b-d9cb-469f-a165-70867728950e")
        XCTAssertEqual(body["decisionEvidenceId"] as? String, "0f8fad5b-d9cb-469f-a165-70867728950e")
    }

    func testATurnWithNoKeyCarriesNoKey() throws {
        let body = try send(decisionEvidenceId: nil)
        XCTAssertNil(body["decisionEvidenceId"], "other turns keep the wire shape they had before ADR-024")
    }

    func testAnEmptyKeyIsNeverSent() throws {
        let body = try send(decisionEvidenceId: "")
        XCTAssertNil(body["decisionEvidenceId"])
    }

    func testTheHeaderIsReadAsAKeyAndRefusedWhenBlankOrOversized() {
        XCTAssertEqual(DecisionEvidenceHeader.key(" 0f8fad5b-d9cb-469f-a165-70867728950e "), "0f8fad5b-d9cb-469f-a165-70867728950e")
        XCTAssertNil(DecisionEvidenceHeader.key(nil))
        XCTAssertNil(DecisionEvidenceHeader.key("   "))
        XCTAssertNil(DecisionEvidenceHeader.key(String(repeating: "x", count: 65)))
        XCTAssertEqual(DecisionEvidenceHeader.name, "X-Decision-Evidence-Id")
    }

    func testTheKeyIsAFrameOfItsOwnNotText() {
        // A stream frame carries a key; nothing in the frame vocabulary carries the evidence facts.
        let frame = StreamFrame.decisionEvidenceId("k-1")
        XCTAssertEqual(frame, .decisionEvidenceId("k-1"))
        XCTAssertNotEqual(frame, .text("k-1"))
    }
}
