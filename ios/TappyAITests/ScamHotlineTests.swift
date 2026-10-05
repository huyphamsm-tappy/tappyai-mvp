import XCTest
@testable import TappyAI

/// The scam-reporting hotline, matched to the Web final (`origin/p7/web-subscription` a43948d41684386a46857077b02b6f413e025d1f):
/// `src/lib/scam-shield/hotline.ts` `SCAM_REPORT_HOTLINE` (display `0692.345.860`, `tel:0692345860`), the "Nghi bị lừa?" card
/// (`ScamHelpCard.tsx`, `v3.scam.help.call`), `scamVerdict.scenario.report` and the report lines of `bocongan2026.ts`
/// (`REPORT_HOTLINE`). The number is the one on the Ministry page the Web cites (Cục Cảnh sát hình sự - Bộ Công an).
/// Police-emergency "113" stays where the Web's own dataset keeps it (the source article's advice block, one
/// «đến trụ sở Công an … gọi 113 để kiểm chứng» line).
final class ScamHotlineTests: XCTestCase {

    private let hotline = "0692.345.860"

    /// The compiled strings of one language, read from its `.lproj` (the test host runs in one locale only).
    private func string(_ key: String, _ lang: String) throws -> String {
        let path = try XCTUnwrap(Bundle.main.path(forResource: lang, ofType: "lproj"), "\(lang).lproj is in the app")
        let bundle = try XCTUnwrap(Bundle(path: path))
        let value = bundle.localizedString(forKey: key, value: "MISSING", table: nil)
        XCTAssertNotEqual(value, "MISSING", "\(key) [\(lang)] exists")
        return value
    }

    func testTheCallLinkIsTheWebHotline() {
        XCTAssertEqual(ScamReportHotline.display, hotline)
        XCTAssertEqual(ScamReportHotline.tel, "tel:0692345860")
        XCTAssertNotNil(URL(string: ScamReportHotline.tel))
    }

    func testTheWebHotlineIsOnTheSurfacesThatMirrorTheWebCard() throws {
        let expected: [(String, String, String)] = [
            ("scam.emergency.call", "vi", "Gọi \(hotline)"),
            ("scam.emergency.call", "en", "Call \(hotline)"),
            ("scamVerdict.scenario.report", "vi", "Báo ngay cho Công an nơi gần nhất hoặc gọi \(hotline) nếu nghi ngờ bị lừa."),
            ("scamVerdict.scenario.report", "en", "Report to the nearest police station or call \(hotline) if you suspect a scam."),
        ]
        for (key, lang, want) in expected {
            XCTAssertEqual(try string(key, lang), want, "\(key) [\(lang)]")
        }
    }

    func testTheOldHotlineIsGoneFromTheStringsThatReportAScam() throws {
        for key in ["scam.emergency.call", "scamVerdict.scenario.report", "scam.share.footer"] {
            for lang in ["vi", "en"] {
                let value = try string(key, lang)
                XCTAssertTrue(value.contains(hotline), "\(key) [\(lang)] carries the hotline: \(value)")
                XCTAssertFalse(value.contains("113"), "\(key) [\(lang)] no longer says 113: \(value)")
            }
        }
    }

    func testTheDatasetReportLinesUseTheHotlineAndTheOfficialBlockKeeps113() {
        let knowledge = ScamKnowledge.load()
        XCTAssertFalse(knowledge.scenarios.isEmpty, "the bundled dataset loads")
        let lines = knowledge.scenarios.flatMap(\.guidance.whatToDo)
        let reportLines = lines.filter { $0.hasPrefix("Báo ngay cho Công an nơi gần nhất") }
        XCTAssertEqual(reportLines.count, 3, "the three scenarios whose report line the Web builds from REPORT_HOTLINE")
        for line in reportLines {
            XCTAssertEqual(line, "Báo ngay cho Công an nơi gần nhất hoặc gọi \(hotline) nếu nghi ngờ bị lừa.")
        }
        XCTAssertFalse(lines.contains { $0.contains("gọi 113 nếu nghi ngờ bị lừa") }, "the old report line is gone")
        // Unchanged on the Web too: a verification line that sends the person to a police station, and the source article's block.
        XCTAssertTrue(lines.contains("Đến trụ sở Công an gần nhất hoặc gọi 113 để kiểm chứng"))
        XCTAssertEqual(knowledge.official.hotline, "113")
        XCTAssertTrue(knowledge.official.reportAdvice.contains("113"))
    }
}
