import XCTest
@testable import TappyAI

/// Phase K: `[TAPPY_MEDIA]`, `[TAPPY_TASK]` and `[TAPPY_RANK]` are server-owned blocks the client
/// never renders as text. MEDIA (news pictures / Wikipedia subject card) is persisted with the
/// message behind CONSULT_V3 / TAPPY_ANSWER_V4; TASK and RANK are the model's control lines,
/// removed on the server and dropped here again as a backstop. Same matrix as
/// `ContentParserMarkerLeakTests` and Android `MediaBlockTest`: closed, unterminated, orphan and
/// malformed all end the same way — invisible — and the prose around them survives.
final class ContentParserServerOnlyMarkersTests: XCTestCase {

    private let names = ["TAPPY_MEDIA", "TAPPY_TASK", "TAPPY_RANK"]
    private let prose = "Tin mới hôm nay."

    /// A body whose sentinel deliberately does not contain the marker name.
    private func body(_ name: String) -> String {
        #"{"v":1,"kind":"news","items":[{"src":"https://evil.example/ZQSENTINELQZ.jpg","href":"https://evil.example/x","label":"ZQSENTINELQZ","title":"ZQSENTINELQZ"}]}"#
    }

    private func assertClean(_ label: String, _ reply: String, file: StaticString = #filePath, line: UInt = #line) {
        let text = ContentParser.parse(reply).text
        for name in names {
            XCTAssertFalse(text.contains(name), "\(label) · \(name) · tag survived: \(text)", file: file, line: line)
        }
        XCTAssertFalse(text.contains("ZQSENTINELQZ"), "\(label) · body survived: \(text)", file: file, line: line)
        XCTAssertTrue(text.hasPrefix(prose), "\(label) · prose lost: \(text)", file: file, line: line)
    }

    func testClosedBlocksNeverLeak() {
        for name in names { assertClean("closed/\(name)", "\(prose)[\(name)]\(body(name))[/\(name)]") }
    }

    func testUnterminatedBlocksNeverLeak() {
        for name in names { assertClean("unterminated/\(name)", "\(prose)[\(name)]\(body(name))") }
    }

    func testOrphanTagsNeverLeak() {
        for name in names {
            assertClean("orphan-open/\(name)", "\(prose)\n[\(name)]\n")
            assertClean("orphan-close/\(name)", "\(prose)\n[/\(name)]\n")
        }
    }

    func testMalformedPayloadNeverLeaksTheBlock() {
        for name in names { assertClean("malformed/\(name)", "\(prose)[\(name)]{not json[/\(name)]") }
    }

    func testTheOtherMarkersAroundAMediaBlockStillDecode() {
        let reply = "\(prose)[TAPPY_MEDIA]\(body("TAPPY_MEDIA"))[/TAPPY_MEDIA][FOLLOWUPS]Thêm tin|Tin khác[/FOLLOWUPS]"
        let parsed = ContentParser.parse(reply)
        XCTAssertEqual(parsed.text, prose)
        XCTAssertEqual(parsed.followups, ["Thêm tin", "Tin khác"])
    }

    func testTheMarkerListHoldsEveryServerBlock() {
        for name in names { XCTAssertTrue(ContentParser.markerNames.contains(name), "\(name) missing from markerNames") }
    }
}
