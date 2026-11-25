import XCTest
@testable import TappyAI

/// «Có bản mới»: the decision to suggest or require an update (owner: a new build the user does not know about is no use).
final class AppUpdateTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func release(_ v: String) -> StoreRelease { StoreRelease(version: v, url: URL(string: "https://apps.apple.com/vn/app/id1")!) }

    func testVersionsCompareNumericallyNotAsText() {
        XCTAssertTrue(AppVersion("1.9")! < AppVersion("1.10")!)
        XCTAssertTrue(AppVersion("1.1")! == AppVersion("1.1.0")!)
        XCTAssertTrue(AppVersion("2.0.0")! > AppVersion("1.99.99")!)
        XCTAssertNil(AppVersion(""))
        XCTAssertNil(AppVersion("1..2"))
        XCTAssertNil(AppVersion("1.x"))
        XCTAssertNil(AppVersion("1.99999999999999999999"), "an enormous part is refused, never trapped")
    }

    func testANewerStoreVersionIsSuggested() {
        let d = AppUpdate.decide(installed: "1.0.0", store: release("1.1.0"), minimum: nil, snoozedVersion: nil, snoozedAt: nil, now: now)
        XCTAssertEqual(d, .suggest(release("1.1.0")))
    }

    func testTheSameOrAnOlderStoreVersionShowsNothing() {
        XCTAssertEqual(AppUpdate.decide(installed: "1.1.0", store: release("1.1.0"), minimum: nil, snoozedVersion: nil, snoozedAt: nil, now: now), .none)
        // A TestFlight build is ahead of the store: no notice.
        XCTAssertEqual(AppUpdate.decide(installed: "1.2.0", store: release("1.1.0"), minimum: nil, snoozedVersion: nil, snoozedAt: nil, now: now), .none)
    }

    func testLaterSilencesThatVersionForADayOnly() {
        let soon = now.addingTimeInterval(-3600)
        XCTAssertEqual(AppUpdate.decide(installed: "1.0.0", store: release("1.1.0"), minimum: nil, snoozedVersion: "1.1.0", snoozedAt: soon, now: now), .none)
        let old = now.addingTimeInterval(-25 * 3600)
        XCTAssertEqual(AppUpdate.decide(installed: "1.0.0", store: release("1.1.0"), minimum: nil, snoozedVersion: "1.1.0", snoozedAt: old, now: now), .suggest(release("1.1.0")))
        // A newer version than the one snoozed is offered at once.
        XCTAssertEqual(AppUpdate.decide(installed: "1.0.0", store: release("1.2.0"), minimum: nil, snoozedVersion: "1.1.0", snoozedAt: soon, now: now), .suggest(release("1.2.0")))
    }

    func testAMinimumAboveTheRunningVersionIsRequiredAndIgnoresLater() {
        let soon = now.addingTimeInterval(-60)
        let d = AppUpdate.decide(installed: "1.0.0", store: release("1.1.0"), minimum: "1.1.0", snoozedVersion: "1.1.0", snoozedAt: soon, now: now)
        XCTAssertEqual(d, .require(release("1.1.0")))
        XCTAssertEqual(AppUpdate.decide(installed: "1.1.0", store: release("1.1.0"), minimum: "1.1.0", snoozedVersion: nil, snoozedAt: nil, now: now), .none)
    }

    func testWithoutAStoreLinkNothingIsShown() {
        XCTAssertEqual(AppUpdate.decide(installed: "1.0.0", store: nil, minimum: "9.0.0", snoozedVersion: nil, snoozedAt: nil, now: now), .none)
    }

    func testLookupIsReadAndOnlyAStoreLinkIsAccepted() {
        let good = Data(#"{"resultCount":1,"results":[{"version":"1.1.0","trackViewUrl":"https://apps.apple.com/vn/app/tappyai/id123?uo=4"}]}"#.utf8)
        XCTAssertEqual(AppUpdate.parseLookup(good)?.version, "1.1.0")
        let evil = Data(#"{"results":[{"version":"1.1.0","trackViewUrl":"https://evil.example/app"}]}"#.utf8)
        XCTAssertNil(AppUpdate.parseLookup(evil))
        let http = Data(#"{"results":[{"version":"1.1.0","trackViewUrl":"http://apps.apple.com/x"}]}"#.utf8)
        XCTAssertNil(AppUpdate.parseLookup(http))
        XCTAssertNil(AppUpdate.parseLookup(Data(#"{"resultCount":0,"results":[]}"#.utf8)), "the app is not listed yet")
        XCTAssertNil(AppUpdate.parseLookup(Data("not json".utf8)))
    }

    func testTheMinimumVersionIsReadFromTheConfigFlags() throws {
        let flags = try JSONDecoder().decode(AppConfig.Flags.self, from: Data(#"{"showProUpgrade":false,"iosMinVersion":"1.1.0"}"#.utf8))
        XCTAssertEqual(flags.iosMinVersion, "1.1.0")
        let old = try JSONDecoder().decode(AppConfig.Flags.self, from: Data(#"{"showProUpgrade":false}"#.utf8))
        XCTAssertNil(old.iosMinVersion)
    }

    func testLaterIsRemembered() {
        let suite = UserDefaults(suiteName: "AppUpdateTests-\(UUID().uuidString)")!
        let memory = AppUpdateMemory(defaults: suite)
        XCTAssertNil(memory.snoozedVersion)
        memory.snooze(version: "1.1.0", now: now)
        XCTAssertEqual(memory.snoozedVersion, "1.1.0")
        XCTAssertEqual(memory.snoozedAt, now)
    }
}
