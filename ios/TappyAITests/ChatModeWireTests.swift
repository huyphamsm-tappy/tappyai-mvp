import XCTest
@testable import TappyAI

/// The chat mode on the wire (iOS audit gap G1, first part). The one-brain server reads `mode` from the request body
/// (`readChatMode`): a request without it runs as plain Chat, which is what iOS did. The web composer sends `auto` by default —
/// Chat that the model itself turns into Thinking (`think_deeper`) when the question needs it — and so does this build now.
/// There is no mode menu yet (a later batch); this only sends the field.
final class ChatModeWireTests: XCTestCase {

    private final class CapturingStreaming: StreamingClient, @unchecked Sendable {
        var endpoint: Endpoint?
        func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<StreamFrame, Error> {
            self.endpoint = endpoint
            return AsyncThrowingStream { $0.finish() }
        }
    }

    private func request(mode: ChatMode?) throws -> (body: [String: Any], timeout: TimeInterval?) {
        let streaming = CapturingStreaming()
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        let messages = [MessagePayload(role: "user", content: "Chào")]
        if let mode {
            _ = service.chatWithContext(messages: messages, userPreferences: nil, responseStyle: nil, mode: mode)
        } else {
            _ = service.chatWithContext(messages: messages, userPreferences: nil, responseStyle: nil)
        }
        let body = try XCTUnwrap(streaming.endpoint?.body)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        return (object, streaming.endpoint?.timeout)
    }

    func testTheWireStringsAreTheServers() {
        XCTAssertEqual(ChatMode.auto.wire, "auto")
        XCTAssertEqual(ChatMode.chat.wire, "chat")
        XCTAssertEqual(ChatMode.web.wire, "web")
        XCTAssertEqual(ChatMode.think.wire, "think")
        XCTAssertEqual(ChatMode.deep.wire, "deep")
        XCTAssertEqual(ChatMode.allCases.count, 5)
    }

    func testTheDefaultModeIsAuto() {
        XCTAssertEqual(ChatMode.default, .auto)
    }

    func testARequestWithoutAModeSendsAuto() throws {
        XCTAssertEqual(try request(mode: nil).body["mode"] as? String, "auto")
    }

    func testEveryModeIsSentAsItsWireString() throws {
        for mode in ChatMode.allCases {
            XCTAssertEqual(try request(mode: mode).body["mode"] as? String, mode.wire, "\(mode)")
        }
    }

    func testOnlyDeepResearchGetsTheLongSilenceLimit() throws {
        XCTAssertEqual(try request(mode: .deep).timeout, ChatStreamTimeout.deepResearch)
        for mode in [ChatMode.auto, .chat, .web, .think] {
            XCTAssertEqual(try request(mode: mode).timeout, ChatStreamTimeout.standard, "\(mode)")
        }
    }

    func testTheRestOfTheBodyIsUnchanged() throws {
        let body = try request(mode: nil).body
        XCTAssertNotNil(body["messages"])
        XCTAssertNil(body["responseStyle"])
        XCTAssertNil(body["userPreferences"])
    }
}
