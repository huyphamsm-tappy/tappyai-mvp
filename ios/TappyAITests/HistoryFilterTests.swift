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

    // "Now" is 2026-11-25 10:00 in Vietnam (UTC+7) = 03:00 UTC. Today starts at 2026-11-24T17:00:00Z.
    private var now: Date { ISO8601Timestamp.date(from: "2026-11-25T03:00:00Z")! }

    func testTimeGroupUsesTheVietnamCalendarDay() {
        // 00:30 Vietnam time on the 25th is still the 24th in UTC, but it is today for the web.
        XCTAssertEqual(HistoryFilter.timeGroup(of: "2026-11-24T17:30:00Z", now: now), .today)
        // 23:30 Vietnam time on the 24th is yesterday: inside the 7 days.
        XCTAssertEqual(HistoryFilter.timeGroup(of: "2026-11-24T16:30:00Z", now: now), .sevenDays)
        // Exactly 7 days before the start of today still counts; one second earlier does not.
        XCTAssertEqual(HistoryFilter.timeGroup(of: "2026-11-17T17:00:00Z", now: now), .sevenDays)
        XCTAssertEqual(HistoryFilter.timeGroup(of: "2026-11-17T16:59:59Z", now: now), .older)
        XCTAssertEqual(HistoryFilter.timeGroup(of: "not a date", now: now), .older)
        XCTAssertEqual(HistoryFilter.timeGroup(of: "2026-12-30T00:00:00Z", now: now), .today)
    }

    func testGroupsPutPinnedFirstOnAllAndDropEmptyOnes() {
        let list = [
            item("old", "Old", at: "2026-10-01T00:00:00Z"),
            item("t1", "T1", at: "2026-11-25T01:00:00Z"),
            item("t2", "T2", at: "2026-11-25T02:00:00Z"),
            item("p", "P", pinned: true, at: "2026-10-02T00:00:00Z"),
        ]
        let all = HistoryFilter.groups(list, segment: .all, now: now)
        XCTAssertEqual(all.map(\.key), [.pinned, .today, .older])
        XCTAssertEqual(all[0].items.map(\.id), ["p"])
        XCTAssertEqual(all[1].items.map(\.id), ["t2", "t1"], "newest first inside a group")
        // On the other tabs a pinned row is grouped by its day like any other.
        let pinnedTab = HistoryFilter.groups(list.filter(\.isPinned), segment: .pinned, now: now)
        XCTAssertEqual(pinnedTab.map(\.key), [.older])
        XCTAssertTrue(HistoryFilter.groups([], segment: .all, now: now).isEmpty)
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
