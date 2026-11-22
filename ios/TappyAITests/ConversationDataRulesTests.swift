import XCTest
@testable import TappyAI

/// Three data rules of the chat history and memory, from the web's own contract (`src/app/api/conversations/route.ts`, `src/app/api/memory/route.ts`):
/// an old chat opens (the list is paged), a save does not overwrite a title, and removing one remembered tag does not erase the others.
final class ConversationDataRulesTests: XCTestCase {

    private static func rows(_ ids: [String], updatedAt: (String) -> String) -> Data {
        let body = ids.map { #"{"id":"\#($0)","title":"t","category":"general","updated_at":"\#(updatedAt($0))","messages":[{"role":"user","content":"hi"}]}"# }
        return Data(("[" + body.joined(separator: ",") + "]").utf8)
    }

    private func service(_ handler: @escaping @Sendable (Endpoint) async throws -> Data) -> (ChatService, ChatTestAPI) {
        let api = ChatTestAPI(handler: handler)
        return (ChatService(api: api, streaming: ScriptedChatStreaming(lines: [])), api)
    }

    // MARK: Old chats

    func testAChatOnALaterPageOpens() async throws {
        let (chat, api) = service { endpoint in
            let before = endpoint.query.first(where: { $0.name == "before" })?.value
            switch before {
            case nil: return ConversationDataRulesTests.rows(["a", "b"], updatedAt: { "2026-11-20T10:00:0\($0 == "a" ? 9 : 8).123456+00:00" })
            case "2026-11-20T10:00:08.123456Z": return ConversationDataRulesTests.rows(["old"], updatedAt: { _ in "2026-10-01T00:00:00+00:00" })
            default: return Data("[]".utf8)
            }
        }
        let found = try await chat.loadConversation(id: "old")
        XCTAssertEqual(found.id, "old")
        let befores = api.sentEndpoints.map { $0.query.first(where: { $0.name == "before" })?.value }
        XCTAssertEqual(befores, [nil, "2026-11-20T10:00:08.123456Z"], "the cursor is the last row's updated_at, with +00:00 written as Z")
    }

    func testAChatThatIsNowhereIsNotFoundAndPagingEnds() async {
        let (chat, api) = service { endpoint in
            let before = endpoint.query.first(where: { $0.name == "before" })?.value
            return before == nil ? ConversationDataRulesTests.rows(["a"], updatedAt: { _ in "2026-11-20T10:00:00+00:00" }) : Data("[]".utf8)
        }
        do { _ = try await chat.loadConversation(id: "missing"); XCTFail("not found expected") } catch {}
        XCTAssertEqual(api.sentEndpoints.count, 2, "one page, then an empty page ends the search")
    }

    func testAServerThatIgnoresTheCursorCannotLoopTheSearch() async {
        let (chat, api) = service { _ in ConversationDataRulesTests.rows(["a"], updatedAt: { _ in "2026-11-20T10:00:00+00:00" }) }
        do { _ = try await chat.loadConversation(id: "missing"); XCTFail("not found expected") } catch {}
        XCTAssertLessThanOrEqual(api.sentEndpoints.count, 2, "the same cursor twice stops the search")
    }

    func testTheCursorIsNeverAnOffsetThatTheServerWouldReadAsASpace() {
        XCTAssertEqual(ConversationPage.cursor(from: "2026-11-20T10:00:00.5+00:00"), "2026-11-20T10:00:00.5Z")
        XCTAssertEqual(ConversationPage.cursor(from: "2026-11-20T10:00:00Z"), "2026-11-20T10:00:00Z")
        XCTAssertNil(ConversationPage.cursor(from: "2026-11-20T10:00:00+07:00"), "paging stops rather than send a plus sign")
        XCTAssertNil(ConversationPage.cursor(from: nil))
        XCTAssertNil(ConversationPage.cursor(from: "  "))
    }

    func testARowThatDoesNotDecodeStillMovesTheCursor() throws {
        let json = #"[{"id":"a","updated_at":"2026-11-20T10:00:00+00:00","messages":[]},{"title":"no id","updated_at":"2026-11-19T10:00:00+00:00"}]"#
        let page = try ResponseDecoder.json.decode(ConversationPage.self, from: Data(json.utf8))
        XCTAssertEqual(page.conversations.map(\.id), ["a"])
        XCTAssertEqual(page.rowCount, 2)
        XCTAssertEqual(page.lastUpdatedAt, "2026-11-19T10:00:00+00:00")
    }

    // MARK: Titles

    func testASaveSendsTheMessagesAndNoTitle() async throws {
        let (chat, api) = service { _ in Data("{}".utf8) }
        try await chat.updateConversation(id: "c1", messages: [MessagePayload(role: "user", content: "hi")])
        let body = try XCTUnwrap(api.bodies(path: "/api/conversations", method: .put).first)
        XCTAssertNil(body["title"], "the server writes only what it is sent: a rename made on the web must survive")
        XCTAssertEqual(body["id"] as? String, "c1")
        XCTAssertNotNil(body["messages"])
    }

    func testARealRenameStillSendsTheTitle() async throws {
        let (chat, api) = service { _ in Data("{}".utf8) }
        try await chat.updateConversation(id: "c1", title: "Tên mới", messages: [])
        XCTAssertEqual(api.bodies(path: "/api/conversations", method: .put).first?["title"] as? String, "Tên mới")
    }

    // MARK: Memory

    func testRemovingOneTagSendsEveryPreferenceCategory() {
        var prefs = MemoryPreferences(food: ["phở"], spa: ["massage"], entertainment: nil, shopping: ["giày"], avoid: ["cay"])
        prefs.food?.removeAll()
        let wire = prefs.wirePayload
        XCTAssertEqual(Set(wire.keys), ["food", "spa", "entertainment", "shopping", "avoid"],
                       "the server replaces the whole column with what it is sent: all five go, or the others are erased")
        XCTAssertEqual(wire["food"], [])
        XCTAssertEqual(wire["spa"], ["massage"])
        XCTAssertEqual(wire["entertainment"], [])
        XCTAssertEqual(wire["avoid"], ["cay"])
    }
}
