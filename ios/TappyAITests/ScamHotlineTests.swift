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

    /// Web ScamHelpCard.tsx + i18n/v3/web.ts:463-470 / 1148-1155: the card's wording, the agency line and the Ministry source link.
    func testTheEmergencyCardCarriesTheWebHelpCardWording() throws {
        let rows: [(String, String, String)] = [
            ("scam.emergency.title", "en", "Think you were scammed?"),
            ("scam.emergency.title", "vi", "Nghi bị lừa?"),
            ("scam.emergency.body", "en", "If you already sent money or shared an OTP code, call the police now."),
            ("scam.emergency.hotlineTitle", "vi", "Đường Dây Nóng"),
            ("scam.emergency.agency", "vi", "Cục Cảnh sát hình sự - Bộ Công an"),
            ("scam.emergency.agency", "en", "Criminal Police Department - Ministry of Public Security"),
            ("scam.emergency.hotlineDesc", "en", "The hotline that receives reports and denunciations of fraud."),
            ("scam.emergency.sourceLabel", "vi", "Nguồn:"),
            ("scam.emergency.sourceName", "en", "Ministry of Public Security"),
        ]
        for (key, lang, want) in rows { XCTAssertEqual(try string(key, lang), want, "\(key) [\(lang)]") }
        XCTAssertEqual(ScamReportHotline.sourceURL, "https://bocongan.gov.vn/hoi-dap/chi-tiet-cau-hoi/ab7d473e-21c9-4950-8ae2-947c1c7605af?page=/")
        XCTAssertNotNil(URL(string: ScamReportHotline.sourceURL))
    }

    /// Web i18n/scamVerdict.ts `scamVerdict.msg.subtitle` + v3/web.ts `v3.scam.msg.placeholder` / `v3.scam.msg.cta`: the message tab also takes a
    /// described situation, and the dataset's tool name is the Web's «Cảnh báo lừa đảo» (bocongan2026.ts:117,249,267).
    func testTheMessageTabAcceptsADescribedSituationAndTheDatasetNamesTheToolLikeTheWeb() throws {
        XCTAssertEqual(try string("scam.msg.intro", "vi"), "Dán tin nhắn hoặc mô tả ngắn tình huống đáng ngờ. TappyAI đối chiếu với các tình huống lừa đảo đã được Bộ Công an cảnh báo.")
        XCTAssertEqual(try string("scam.msg.intro", "en"), "Paste a message or briefly describe a suspicious situation. TappyAI compares it with the scam scenarios the Ministry of Public Security has warned about.")
        XCTAssertEqual(try string("scam.msg.placeholder", "en"), "Example: Someone claiming to be a bank employee called me and asked me to transfer money to verify my account…")
        XCTAssertEqual(try string("scam.msg.check", "vi"), "Phân tích ngay")
        XCTAssertEqual(try string("scam.msg.check", "en"), "Analyze now")
        let lines = ScamKnowledge.load().scenarios.flatMap(\.guidance.whatToDo)
        XCTAssertTrue(lines.contains("Dùng công cụ Kiểm tra URL của Cảnh báo lừa đảo trước khi mở"))
        XCTAssertTrue(lines.contains("Dùng Quét mã QR của Cảnh báo lừa đảo để kiểm tra đường dẫn trước khi mở"))
        XCTAssertTrue(lines.contains("Dùng Kiểm tra URL của Cảnh báo lừa đảo trước khi mở link lạ"))
        XCTAssertFalse(lines.contains { $0.contains("Scam Shield") })
    }
}
