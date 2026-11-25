import XCTest
@testable import TappyAI

/// Violation notices and appeals inside the app (App Review 1.2), following the web's notices page.
final class ModerationNoticesTests: XCTestCase {
    private let json = """
    {"decisions":[
      {"id":"d1","created_at":"2026-11-10T08:00:00Z","rule_group":"spam","outcome":"restricted","restrict_days":7,
       "strike_expires_at":"2027-02-10T08:00:00Z","appeal":null,"can_appeal":true},
      {"id":"d2","created_at":"2026-10-01T08:00:00Z","rule_group":"hate","outcome":"warning","restrict_days":null,
       "strike_expires_at":null,"appeal":{"status":"pending","created_at":"2026-10-02T00:00:00Z"},"can_appeal":false},
      {"id":"d3","created_at":"x","rule_group":"new_group","outcome":"something_new","can_appeal":false},
      {"created_at":"no id"}]}
    """

    func testNoticesAreReadAndTheBrokenRowIsDropped() throws {
        let r = try ResponseDecoder.json.decode(ModerationNoticesResponse.self, from: Data(json.utf8))
        XCTAssertEqual(r.decisions.map(\.id), ["d1", "d2", "d3"])
        XCTAssertEqual(r.decisions[0].outcome, .restricted)
        XCTAssertEqual(r.decisions[0].restrictDays, 7)
        XCTAssertTrue(r.decisions[0].canAppeal)
        XCTAssertEqual(r.decisions[1].appeal, .pending)
        XCTAssertFalse(r.decisions[1].canAppeal)
        XCTAssertNil(r.decisions[2].outcome, "an outcome from a newer server is a generic notice, not a crash")
    }

    func testAppealLengthRule() {
        XCTAssertFalse(ModerationNotice.isValidAppeal("short"))
        XCTAssertFalse(ModerationNotice.isValidAppeal("          x"))
        XCTAssertTrue(ModerationNotice.isValidAppeal("Đây là một nhầm lẫn thật sự"))
        XCTAssertFalse(ModerationNotice.isValidAppeal(String(repeating: "a", count: 1001)))
    }

    func testAppealCallAndItsGuards() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true}"#.utf8)
        let service = ProfileService(api: api)
        try await service.appealModerationNotice(id: "d1", message: "  Đây là một nhầm lẫn thật sự  ")
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/moderation/decisions/d1/appeal")
        XCTAssertEqual(sent.method, .post)
        XCTAssertTrue(sent.requiresAuth)
        let body = try XCTUnwrap(sent.body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] })
        XCTAssertEqual(body["message"], "Đây là một nhầm lẫn thật sự")

        do { try await service.appealModerationNotice(id: "../x", message: "Đây là một nhầm lẫn thật sự"); XCTFail("unsafe id") } catch {}
        do { try await service.appealModerationNotice(id: "d1", message: "short"); XCTFail("too short") } catch {}
        XCTAssertEqual(api.sentEndpoints.count, 1)
    }

    func testEveryRuleGroupHasAName() throws {
        let data = try Data(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("TappyAI/Resources/Localizable.xcstrings"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        for id in ["spam", "harassment", "hate", "sexual", "violence_selfharm", "scam_misinfo", "impersonation", "ip_privacy", "illegal_goods", "child_safety"] {
            XCTAssertNotNil(strings["notices.ruleGroup.\(id)"], id)
        }
    }
}
