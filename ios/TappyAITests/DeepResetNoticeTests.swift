import XCTest
@testable import TappyAI

/// A Deep Research report asked for with none left this month runs as Thinking, and the server sends the day the reports come back in the
/// `x-tappy-deep-reset` header (web `src/lib/plans/deepResearchNotice.ts`, owner 20/11/2026). The app says it with one fixed sentence.
final class DeepResetNoticeTests: XCTestCase {

    func testTheHeaderNameIsTheServers() {
        XCTAssertEqual(DeepResetHeader.name, "x-tappy-deep-reset")
    }

    func testOnlyADateIsAccepted() {
        XCTAssertEqual(DeepResetHeader.date("2026-12-01"), "2026-12-01")
        XCTAssertEqual(DeepResetHeader.date("  2027-01-01 "), "2027-01-01")
        for bad in [nil, "", "tomorrow", "2026-13-01", "2026-12-32", "2026-1-1", "26-12-01", "2026/12/01", "2026-12-01T00:00:00Z", "２０２６-12-01", "2026-12-0a"] {
            XCTAssertNil(DeepResetHeader.date(bad), String(describing: bad))
        }
    }

    func testTheDateIsShownDayFirst() {
        XCTAssertEqual(DeepResetHeader.displayDate("2026-12-01"), "01/12/2026")
        XCTAssertEqual(DeepResetHeader.displayDate("not a date"), "not a date", "a value that is not a date comes back unchanged, like the web")
    }

    func testTheSentenceNamesTheDate() {
        let sentence = String(format: NSLocalizedString("chat.deepExhausted", comment: ""), DeepResetHeader.displayDate("2026-12-01"))
        XCTAssertNotEqual(sentence, "chat.deepExhausted")
        XCTAssertTrue(sentence.contains("01/12/2026"))
    }

    func testTheFrameCarriesTheDate() {
        XCTAssertEqual(StreamFrame.deepResetOn("2026-12-01"), .deepResetOn("2026-12-01"))
        XCTAssertNotEqual(StreamFrame.deepResetOn("2026-12-01"), .deepResetOn("2027-01-01"))
    }
}
