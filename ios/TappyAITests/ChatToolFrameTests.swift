import XCTest
@testable import TappyAI

/// The `9:` (tool call) and `a:` (tool result) frames (iOS audit gap G4).
/// The AI SDK v4 data stream sends each as ONE JSON OBJECT — `{toolCallId, toolName, args}` / `{toolCallId, result}` — but the reader
/// only understood an array, so no tool call was ever recorded and the «searching the web…» hint never showed.
@MainActor
final class ChatToolFrameTests: XCTestCase {

    private func data(_ json: String) -> Data { Data(json.utf8) }

    // MARK: Parsers

    func testAToolCallIsReadFromAnObject() {
        let call = ChatViewModel.parseToolCall(data("{\"toolCallId\":\"c1\",\"toolName\":\"web_search\",\"args\":{\"query\":\"x\"}}"))
        XCTAssertEqual(call?.id, "c1")
        XCTAssertEqual(call?.toolName, "web_search")
    }

    func testAToolCallIsStillReadFromAnArray() {
        let call = ChatViewModel.parseToolCall(data("[{\"toolCallId\":\"c2\",\"toolName\":\"read_page\"}]"))
        XCTAssertEqual(call?.id, "c2")
        XCTAssertEqual(call?.toolName, "read_page")
    }

    func testAToolCallWithoutIdOrNameIsNothing() {
        XCTAssertNil(ChatViewModel.parseToolCall(data("{\"toolName\":\"web_search\"}")))
        XCTAssertNil(ChatViewModel.parseToolCall(data("{\"toolCallId\":\"c1\"}")))
        XCTAssertNil(ChatViewModel.parseToolCall(data("[]")))
        XCTAssertNil(ChatViewModel.parseToolCall(data("not json")))
    }

    func testAToolResultIsReadFromAnObject() throws {
        let result = try XCTUnwrap(ChatViewModel.parseToolResult(data("{\"toolCallId\":\"c1\",\"result\":{\"ok\":true}}")))
        XCTAssertEqual(result.id, "c1")
        let decoded = try JSONSerialization.jsonObject(with: result.data) as? [String: Any]
        XCTAssertEqual(decoded?["ok"] as? Bool, true)
    }

    func testAToolResultIsStillReadFromAnArray() {
        XCTAssertEqual(ChatViewModel.parseToolResult(data("[{\"toolCallId\":\"c3\",\"result\":{}}]"))?.id, "c3")
    }

    func testAToolResultThatIsNotAContainerDoesNotCrash() {
        // A bare string or number is not a JSON object; the reader must still answer (and not raise).
        let result = ChatViewModel.parseToolResult(data("{\"toolCallId\":\"c4\",\"result\":\"plain text\"}"))
        XCTAssertEqual(result?.id, "c4")
        XCTAssertNil(ChatViewModel.parseToolResult(data("{\"result\":{}}")))
    }

    // MARK: Through the view model

    func testAToolCallAndItsResultAreRecordedOnTheReply() async {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        let lines = [
            "9:{\"toolCallId\":\"c1\",\"toolName\":\"web_search\",\"args\":{\"query\":\"x\"}}",
            "a:{\"toolCallId\":\"c1\",\"result\":{\"hits\":2}}",
            "0:\"Xong\"",
            "d:{\"finishReason\":\"stop\"}",
        ]
        let vm = ChatViewModel(service: ChatService(api: MockAPIClient(), streaming: ScriptedChatStreaming(lines: lines)), session: session)
        vm.inputText = "Tìm giúp"
        vm.send()
        await waitUntil { !vm.isStreaming }

        let invocations = vm.messages.last?.toolInvocations ?? []
        XCTAssertEqual(invocations.map(\.toolName), ["web_search"])
        guard case .result? = invocations.first?.state else { return XCTFail("the call must carry its result") }
    }

    // MARK: Hints for the one-brain tools

    func testTheOneBrainToolsHaveAHintInBothLanguages() {
        for tool in ["web_search", "read_page", "think_deeper", "get_weather_forecast", "calculate"] {
            XCTAssertNotNil(ToolHints.hint(for: tool, locale: "vi"), tool)
            XCTAssertNotNil(ToolHints.hint(for: tool, locale: "en"), tool)
        }
        XCTAssertNil(ToolHints.hint(for: "some_future_tool", locale: "en"), "an unknown tool keeps the generic indicator")
    }
}
