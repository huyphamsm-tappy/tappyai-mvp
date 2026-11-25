import XCTest
@testable import TappyAI

/// Chat history: pin, archive, search and older pages (web chat workspace, slice 2).
final class HistoryFilterTests: XCTestCase {
    private func item(_ id: String, _ title: String, pinned: Bool = false, archived: Bool = false, at: String = "2026-11-20T00:00:00Z") -> ChatHistoryItem {
        ChatHistoryItem(id: id, title: title, category: nil, updatedAt: at, messages: nil, isPinned: pinned, isArchived: archived)
    }

    func testAllHidesArchivedAndPutsPinnedFirst() {
        let list = [item("a", "A"), item("b", "B", pinned: true), item("c", "C", archived: true)]
        XCTAssertEqual(HistoryFilter.visible(list, segment: .all, query: "").map(\.id), ["b", "a"])
    }

    func testPinnedAndArchivedSegments() {
        let list = [item("a", "A", pinned: true), item("b", "B", pinned: true, archived: true), item("c", "C", archived: true)]
        XCTAssertEqual(HistoryFilter.visible(list, segment: .pinned, query: "").map(\.id), ["a"])
        XCTAssertEqual(HistoryFilter.visible(list, segment: .archived, query: "").map(\.id), ["b", "c"])
    }

    func testSearchIgnoresCaseAndVietnameseAccents() {
        let list = [item("a", "Quán phở ngon"), item("b", "Du lịch Đà Nẵng")]
        XCTAssertEqual(HistoryFilter.visible(list, segment: .all, query: "PHO").map(\.id), ["a"])
        XCTAssertEqual(HistoryFilter.visible(list, segment: .all, query: "da nang").map(\.id), ["b"])
        XCTAssertEqual(HistoryFilter.visible(list, segment: .all, query: "  ").count, 2)
    }

    func testCursorOnlyWhenThePageWasFull() {
        let full = (0..<40).map { item("i\($0)", "t", at: "2026-11-\(10 + $0 % 10)T00:00:00Z") }
        XCTAssertEqual(HistoryFilter.nextCursor(lastPage: full, all: full, pageSize: 40), full.last?.updatedAt)
        XCTAssertNil(HistoryFilter.nextCursor(lastPage: Array(full.prefix(10)), all: full, pageSize: 40))
        XCTAssertNil(HistoryFilter.nextCursor(lastPage: [], all: [], pageSize: 40))
    }

    func testRowsReadTheFlagsAndAnOldServerReadsFalse() throws {
        let rows = try ResponseDecoder.json.decode(LossyList<ChatHistoryItem>.self, from: Data(
            #"[{"id":"a","title":"A","updated_at":"2026-11-20T00:00:00Z","is_pinned":true,"is_archived":false},{"id":"b","title":"B","updated_at":"2026-11-20T00:00:00Z"}]"#.utf8)).items
        XCTAssertEqual(rows.map(\.isPinned), [true, false])
        XCTAssertEqual(rows.map(\.isArchived), [false, false])
    }

    func testPinSendsOnlyTheFlag() async throws {
        let api = MockAPIClient()
        api.stubbed = Data("{}".utf8)
        try await ProfileService(api: api).setConversationFlags(id: "c1", pinned: true)
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.method, .put)
        let body = try XCTUnwrap(sent.body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        XCTAssertEqual(Set(body.keys), ["id", "pinned"], "a pin must not carry messages or a title")
    }

    func testOlderPageIsAskedWithBefore() async throws {
        let api = MockAPIClient()
        api.stubbed = Data("[]".utf8)
        _ = try await ProfileService(api: api).fetchConversations(before: "2026-11-01T00:00:00Z")
        XCTAssertEqual(api.sentEndpoints.first?.query.first?.name, "before")
    }
}
