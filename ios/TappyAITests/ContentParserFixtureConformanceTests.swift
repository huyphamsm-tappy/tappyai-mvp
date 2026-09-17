import XCTest
@testable import TappyAI

/// P4-02 — SHARED STRUCTURED-CONTENT CONFORMANCE (iOS side).
///
/// The cases come from `shared/structured-content/marker-fixtures.json`, the SAME file Web and
/// Android read. One file, three consumers: when the server gains a marker or changes a shape, the
/// fixture is edited once and all three suites fail until all three parsers agree.
///
/// WHY THIS EXISTS. `ContentParserMarkerLeakTests` already covers marker LEAKS, and it passes. It
/// does not cover the shape that broke production on 2026-08-27: a CTA block in its BARE form (no
/// closing tag) with `[FOLLOWUPS]` trailing it. The old `noTag` pattern was end-anchored
/// (`\s*$`), so the trailing followups line prevented it from matching and the buttons were
/// silently LOST. Worse, `stripMarkerResidue`'s end-anchored `[\s\S]*$` pattern then removed the
/// block AND every character after it — so any prose the model wrote following the CTA block
/// vanished as well.
///
/// Web fixed this by brace-matching the payload; Android and iOS kept the regex Web abandoned.
/// These fixtures are the shared definition of "fixed".
final class ContentParserFixtureConformanceTests: XCTestCase {

    private struct FixtureCase: Decodable {
        let id: String
        let description: String
        let input: String
        let expectVisibleContains: [String]
        let expectVisibleNotContains: [String]
        let expectCtaLabels: [String]
        let expectFollowups: [String]
        let expectPlanPresent: Bool
        /// Durable places decoded from [TAPPY_PLACES]. Absent on a case that carries none, so both
        /// are optional and default to "no places" rather than failing to decode the fixture.
        let expectPlacesCount: Int?
        let expectPlaceNames: [String]?
    }

    private struct FixtureFile: Decodable {
        let version: Int
        let cases: [FixtureCase]
    }

    /// Walks up from this source file to the repository root to find the shared fixture file.
    ///
    /// Resolved from `#filePath` rather than the test bundle so the fixture does not have to be
    /// copied into bundle resources — the point of the shared suite is that all three platforms
    /// read ONE physical file, and a copied fixture is a fixture that can drift.
    private func fixtureURL() throws -> URL {
        var dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<10 {
            let candidate = dir
                .appendingPathComponent("shared")
                .appendingPathComponent("structured-content")
                .appendingPathComponent("marker-fixtures.json")
            if FileManager.default.fileExists(atPath: candidate.path) { return candidate }
            dir = dir.deletingLastPathComponent()
        }
        throw XCTSkip("shared/structured-content/marker-fixtures.json not found above \(#filePath)")
    }

    func testEverySharedFixtureCaseConforms() throws {
        let url = try fixtureURL()
        let file = try JSONDecoder().decode(FixtureFile.self, from: Data(contentsOf: url))
        XCTAssertEqual(file.version, 1, "fixture schema version")
        XCTAssertFalse(file.cases.isEmpty, "fixture file must carry cases")

        // Every failure is recorded so one run reports the full conformance gap rather than
        // stopping at the first case — the point of a shared suite is to see the whole drift.
        var failures: [String] = []

        for c in file.cases {
            let parsed = ContentParser.parse(c.input)
            let visible = parsed.text

            for forbidden in c.expectVisibleNotContains where visible.contains(forbidden) {
                failures.append("[\(c.id)] LEAKED \"\(forbidden)\" into visible text — \(c.description)\n        visible was: \(visible.prefix(200))")
            }

            for required in c.expectVisibleContains where !visible.contains(required) {
                failures.append("[\(c.id)] LOST prose \"\(required)\"\n        visible was: \(visible.prefix(200))")
            }

            let actualLabels = parsed.ctaButtons.map(\.label)
            if actualLabels != c.expectCtaLabels {
                failures.append("[\(c.id)] CTA labels: expected \(c.expectCtaLabels) but was \(actualLabels) — \(c.description)")
            }

            if parsed.followups != c.expectFollowups {
                failures.append("[\(c.id)] followups: expected \(c.expectFollowups) but was \(parsed.followups)")
            }

            if (parsed.plan != nil) != c.expectPlanPresent {
                failures.append("[\(c.id)] plan presence: expected \(c.expectPlanPresent) but was \(parsed.plan != nil)")
            }

            // The DURABLE place block. Count first, then the names IN ORDER — rank order is part of
            // the contract, not a rendering preference, so a parser that decodes the right places
            // in the wrong order is still drift.
            let expectPlaces = c.expectPlacesCount ?? 0
            if parsed.places.count != expectPlaces {
                failures.append("[\(c.id)] places count: expected \(expectPlaces) but was \(parsed.places.count) — \(c.description)")
            }
            if let expectedNames = c.expectPlaceNames {
                let actualNames = parsed.places.map { $0.name ?? "" }
                if actualNames != expectedNames {
                    failures.append("[\(c.id)] place names: expected \(expectedNames) but was \(actualNames)")
                }
            }
        }

        if !failures.isEmpty {
            XCTFail("\n\(failures.count) shared-fixture conformance failure(s) on iOS:\n\n"
                    + failures.joined(separator: "\n\n") + "\n")
        }
    }
}
