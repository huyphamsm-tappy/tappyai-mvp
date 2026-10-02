import XCTest
@testable import TappyAI

/// Scam Shield three-state vocabulary, matched to WEB `src/lib/scam-shield/verdict.ts` (commit 65685a7) and the final
/// wording of commit 93948b2 (`docs/uat/SCAM-SHIELD-PARITY.md` §8).
final class ScamVerdictTests: XCTestCase {

    private func decode(_ json: String) throws -> ScamCheckResult {
        try JSONDecoder().decode(ScamCheckResult.self, from: Data(json.utf8))
    }

    func testLinkLevelsMapTheWayTheWebMapsThem() {
        XCTAssertEqual(ScamVerdict.link(level: .critical), .familiar)
        XCTAssertEqual(ScamVerdict.link(level: .high), .familiar)
        XCTAssertEqual(ScamVerdict.link(level: .medium), .suspicious)
        for level in [ScamRiskLevel.safe, .low, .inconclusive, .unknown] {
            XCTAssertEqual(ScamVerdict.link(level: level), .unrecognized, "\(level) is never shown as reassurance")
        }
    }

    func testTheServersVerdictWinsAndAnOlderServerFallsBackToTheLevel() throws {
        let withVerdict = try decode(#"{"url":"https://x.test","risk":{"score":90,"confidence":70,"level":"HIGH"},"evidence":{"items":[]},"actions":[],"cached":false,"verdict":"suspicious"}"#)
        XCTAssertEqual(withVerdict.verdict, .suspicious)
        let older = try decode(#"{"url":"https://x.test","risk":{"score":5,"confidence":70,"level":"LOW"},"evidence":{"items":[]},"actions":[],"cached":false}"#)
        XCTAssertEqual(older.verdict, .unrecognized, "SAFE / LOW from an older server is not a reassurance")
        let unknownWord = try decode(#"{"url":"https://x.test","risk":{"score":1,"confidence":1,"level":"CRITICAL"},"evidence":{"items":[]},"actions":[],"cached":false,"verdict":"safe"}"#)
        XCTAssertEqual(unknownWord.verdict, .familiar, "a verdict word this build does not know is ignored, the level decides")
    }

    func testReasonSentencesAreReadAndOnlyWarningAndCriticalCount() throws {
        let r = try decode(#"{"url":"https://x.test","risk":{"score":50,"confidence":70,"level":"MEDIUM"},"evidence":{"items":[{"source":"dns","severity":"warning","summary":"s","detail":"d","reasonCode":"dns.NO_A_RECORD","reason_vi":"Câu tiếng Việt","reason_en":"English sentence"},{"source":"ssl","severity":"safe","summary":"ok","detail":"","reasonCode":"ssl.VALID","reason_vi":"Chứng chỉ hợp lệ","reason_en":"Valid"},{"source":"old","severity":"critical","summary":"s","detail":"d"}]},"actions":[],"cached":false}"#)
        let items = r.evidence.items
        XCTAssertEqual(items[0].reason(vietnamese: true), "Câu tiếng Việt")
        XCTAssertEqual(items[0].reason(vietnamese: false), "English sentence")
        XCTAssertEqual(items[0].reasonCode, "dns.NO_A_RECORD")
        XCTAssertTrue(items[0].isReasonWorthy)
        XCTAssertFalse(items[1].isReasonWorthy, "a `safe` finding is «normal», not a reason")
        XCTAssertNil(items[2].reason(vietnamese: true), "an older server sends no sentence")
    }

    func testMessageOutcomesMapToTheThreeStates() {
        XCTAssertEqual(ScamMessageOutcome.matched(number: 1, signals: [], links: []).verdict, .familiar)
        XCTAssertEqual(ScamMessageOutcome.unsure(signals: [], links: []).verdict, .suspicious)
        XCTAssertEqual(ScamMessageOutcome.noSigns(links: []).verdict, .unrecognized)
    }

    func testTheRetiredReassuringAndScoreWordingIsGone() {
        for key in ["scamShield.level.safe", "scamShield.level.low", "scamShield.score",
                    "scam.msg.deeper.button", "scam.msg.deeper.note"] {
            XCTAssertEqual(NSLocalizedString(key, value: "MISSING", comment: ""), "MISSING", "\(key) must no longer exist")
        }
    }

    func testEveryVerdictStringExists() {
        var keys = ["scam.msg.matched.title", "scam.msg.matched.body", "scam.msg.unsure.title", "scam.msg.unsure.body",
                    "scam.msg.nosigns.title", "scam.msg.nosigns.body", "scam.msg.privacy",
                    "scamVerdict.disclaimer", "scamVerdict.scenario.report", "scamVerdict.link.reasons", "scamVerdict.qr.noVerdict"]
        for v in [ScamVerdict.familiar, .suspicious, .unrecognized] { keys += [v.linkTitleKey, v.linkBodyKey] }
        for key in keys {
            XCTAssertNotEqual(NSLocalizedString(key, value: "MISSING", comment: ""), "MISSING", key)
        }
    }

    func testEveryNonLinkQRKindUsesTheOneWebSentence() {
        for p in [QRPayload.wifi, .contact, .phone, .sms, .email, .payment, .crypto, .text("x")] {
            XCTAssertEqual(p.warningKey, "scamVerdict.qr.noVerdict")
        }
    }
}
