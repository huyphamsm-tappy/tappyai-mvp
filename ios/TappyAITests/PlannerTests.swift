import XCTest
@testable import TappyAI

/// AI Planner — port of web `derivePlans` (`src/lib/planner/derivePlans.ts`, rc/web-uat) over
/// `GET /api/conversations`.
final class PlannerTests: XCTestCase {

    private func msg(_ role: String, _ content: String) -> PlannerConversation.Message {
        .init(role: role, content: content)
    }
    private func block(_ json: String) -> String { "Đây là kế hoạch.\n[TAPPY_PLAN]\(json)[/TAPPY_PLAN]" }

    func testDerivesEveryPlanInServerOrderThenMessageOrder() {
        let rows = [
            PlannerConversation(id: "c-new", title: "Đà Nẵng", updatedAt: "2026-09-27T10:00:00.000Z", messages: [
                msg("user", "lên kế hoạch"),
                msg("assistant", block(PlanFixtures.daNangThreeDays)),
                msg("assistant", block(PlanFixtures.hoiAnOneDay)),
            ]),
            PlannerConversation(id: "c-old", title: "Hội An", updatedAt: "2026-09-20T10:00:00Z", messages: [
                msg("assistant", block(PlanFixtures.hoiAnOneDay)),
            ]),
        ]
        let plans = PlannerDerivation.derivePlans(rows)
        XCTAssertEqual(plans.map(\.id), ["c-new#1", "c-new#2", "c-old#0"], "several plans per thread are all kept")
        XCTAssertEqual(plans.map(\.conversationId), ["c-new", "c-new", "c-old"])

        let daNang = plans[0]
        XCTAssertEqual(daNang.title, "Đà Nẵng 3 ngày 2 đêm - Biển, ẩm thực & tham quan")
        XCTAssertEqual(daNang.kind, .trip)
        XCTAssertEqual(daNang.people, 2)
        XCTAssertEqual(daNang.budgetTotal, "6.000.000 VND")
        XCTAssertEqual(daNang.dayCount, 4, "empty days count, as on web")
        XCTAssertEqual(daNang.stopCount, 13)
        XCTAssertEqual(daNang.stops.count, PlannerDerivation.previewStops)
        XCTAssertEqual(daNang.categories, ["hotel", "food", "entertainment", "attraction"])
        XCTAssertNotNil(daNang.updatedAt)
        XCTAssertNotNil(plans[2].updatedAt, "a timestamp without fractional seconds parses too")

        let hoiAn = plans[1]
        XCTAssertNil(hoiAn.budgetTotal, "\"chưa có giá\" is not a budget")
        XCTAssertNil(hoiAn.coverUrl, "no stop carries a photo")
    }

    func testOnlyAssistantMessagesWithAParsablePlanCount() {
        let rows = [PlannerConversation(id: "c", title: "t", updatedAt: nil, messages: [
            msg("user", block(PlanFixtures.hoiAnOneDay)),                   // the user's own text
            msg("assistant", "Chỉ là câu trả lời thường."),
            msg("assistant", block("{not json")),                           // unparsable
            msg("assistant", block(#"{"days":[{"title":"x","activities":[]}]}"#)), // old shape, not a plan
        ])]
        XCTAssertTrue(PlannerDerivation.derivePlans(rows).isEmpty)
    }

    func testTitleFallsBackToTheConversationAndAnUntitledPlanIsSkipped() {
        let untitled = #"{"days":[{"label":"Tối nay","items":[{"name":"Ăn tối","photo_url":"https://lh3.googleusercontent.com/p/A"}]}]}"#
        let named = PlannerDerivation.derivePlans([PlannerConversation(id: "c", title: "  Tối thứ Bảy  ", updatedAt: nil,
                                                                       messages: [msg("assistant", block(untitled))])])
        XCTAssertEqual(named.first?.title, "Tối thứ Bảy")
        XCTAssertEqual(named.first?.coverUrl, "https://lh3.googleusercontent.com/p/A")
        XCTAssertNil(named.first?.kind)
        let skipped = PlannerDerivation.derivePlans([PlannerConversation(id: "c", title: nil, updatedAt: nil,
                                                                         messages: [msg("assistant", block(untitled))])])
        XCTAssertTrue(skipped.isEmpty)
    }

    func testFacetsShowOnlyWhenMoreThanOneKindIsPresent() {
        func plan(_ type: String) -> PlannerConversation.Message {
            msg("assistant", block(#"{"type":"\#(type)","title":"T","days":[{"label":"d","items":[{"name":"n"}]}]}"#))
        }
        let tripsOnly = PlannerDerivation.derivePlans([PlannerConversation(id: "a", title: nil, updatedAt: nil, messages: [plan("trip")])])
        XCTAssertEqual(PlannerDerivation.facets(tripsOnly), [])
        let both = PlannerDerivation.derivePlans([PlannerConversation(id: "a", title: nil, updatedAt: nil,
                                                                      messages: [plan("evening"), plan("trip")])])
        XCTAssertEqual(PlannerDerivation.facets(both), [.trip, .evening])
        XCTAssertEqual(PlannerDerivation.filter(both, kind: .evening).map(\.kind), [.evening])
        XCTAssertEqual(PlannerDerivation.filter(both, kind: nil).count, 2)
    }

    func testReadsGetConversationsAndToleratesABadRow() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"""
        [{"id":"c1","title":"A","category":"general","updated_at":"2026-09-27T10:00:00Z","messages":[{"role":"assistant","content":"hi"}]},
         {"id":"c2","title":null,"updated_at":null,"messages":"corrupt"}]
        """#.utf8)
        let rows = try await PlannerService(api: api).conversations()
        XCTAssertEqual(rows.map(\.id), ["c1", "c2"])
        XCTAssertEqual(rows[0].updatedAt, "2026-09-27T10:00:00Z")
        XCTAssertEqual(rows[1].messages, [], "a malformed message list costs that row its plans, not the list")
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/conversations")
        XCTAssertEqual(sent.method, .get)
        XCTAssertTrue(sent.requiresAuth)
    }

    func testPlannerStringsAreInTheCatalog() {
        for key in ["planner.title", "planner.subtitle", "planner.all", "planner.travel", "planner.evening",
                    "planner.count", "planner.empty", "planner.emptyTitle", "planner.emptyFiltered", "planner.cta",
                    "planner.days", "planner.stops", "planner.people", "planner.budget", "planner.lastActivity",
                    "planner.open", "planner.expand", "planner.collapse", "planner.more", "planner.map",
                    "planner.scope", "planner.listTitle", "planner.error", "profile.row.planner", "profile.row.planner.desc"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
