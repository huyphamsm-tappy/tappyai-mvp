import XCTest
@testable import TappyAI

/// P0-1 REGRESSION (permanent): no server marker may ever render as message body.
///
/// The server owns a CLOSED set of marker blocks and injects them into the assistant TEXT stream,
/// because text is the only channel that survives persistence and reload. It does not branch on
/// which client is reading. `[TAPPY_SHOPPING]` was added for the web decision card and handled
/// only there, so on iOS every shopping turn would render a block of raw JSON — and render it
/// FIRST, because the server emits that block as a `0:` frame right after the tool result, ahead
/// of the prose. `[CTA_BUTTONS]` had already leaked the same way once before.
///
/// This is the iOS half of a matrix Android and Web run too
/// (`ChatResponseParserMarkerLeakTest.kt`, `chatMarkerProtocol.test.tsx`). Same markers, same
/// shapes, same assertions — the bug being prevented is "one client learned about a marker and the
/// others did not", and a test living on only one client cannot catch that.
///
/// ⚠️ THE ASSERTION CHECKS THE PAYLOAD, NOT JUST THE TAG. Stripping `[TAPPY_SHOPPING]` while
/// leaving the JSON it wrapped still shows the user raw JSON. The Android version was initially
/// written tag-only and a mutation proved it worthless. Each body therefore carries a sentinel —
/// one that deliberately does NOT contain the marker name, so the two assertions stay independent.
final class ContentParserMarkerLeakTests: XCTestCase {

    private let markerNames = ["TAPPY_PLAN", "CTA_BUTTONS", "FOLLOWUPS", "TAPPY_SHOPPING"]

    private func sentinel(_ name: String) -> String {
        "ZQSENTINEL\(markerNames.firstIndex(of: name) ?? 0)QZ"
    }

    private func body(_ name: String) -> String {
        switch name {
        case "TAPPY_PLAN":
            return #"{"type":"trip","title":"\#(sentinel(name))","days":[]}"#
        case "CTA_BUTTONS":
            return #"{"buttons":[{"label":"\#(sentinel(name))","type":"maps","url":"https://maps.example","primary":true}]}"#
        case "FOLLOWUPS":
            return "\(sentinel(name))|Có chỗ đậu xe không?|Mở cửa mấy giờ?"
        default:
            return #"{"v":1,"entities":[{"key":"\#(sentinel(name))","config":"M1 · 32GB","offers":[]}],"recommendation":null}"#
        }
    }

    private func assertClean(_ label: String, _ reply: String, file: StaticString = #filePath, line: UInt = #line) {
        let parsed = ContentParser.parse(reply)
        for name in markerNames {
            XCTAssertFalse(
                parsed.text.contains(name),
                "\(label) · \(name) · tag survived: \(parsed.text)",
                file: file, line: line
            )
            XCTAssertFalse(
                parsed.text.contains(sentinel(name)),
                "\(label) · \(name) · body survived: \(parsed.text)",
                file: file, line: line
            )
        }
    }

    func testClosedBlocksNeverLeak() {
        for name in markerNames {
            assertClean("closed/\(name)", "Gợi ý đây nhé.\n[\(name)]\(body(name))[/\(name)]")
        }
    }

    func testUnterminatedBlocksNeverLeak() {
        // What the screen parses on the frame BEFORE the closing tag arrives — and what a planning
        // reply truncated at finishReason "length" looks like permanently.
        for name in markerNames {
            assertClean("unterminated/\(name)", "Gợi ý đây nhé.\n[\(name)]\(body(name))")
        }
    }

    func testOrphanOpeningTagsNeverLeak() {
        for name in markerNames {
            assertClean("orphan-open/\(name)", "Gợi ý đây nhé.\n[\(name)]\nCòn gì nữa không?")
        }
    }

    func testOrphanClosingTagsNeverLeak() {
        for name in markerNames {
            assertClean("orphan-close/\(name)", "Gợi ý đây nhé.\n[/\(name)]\nCòn gì nữa không?")
        }
    }

    func testMalformedPayloadNeverLeaksTheBlock() {
        for name in markerNames {
            assertClean("malformed/\(name)", "Trước.\n[\(name)]{not json[/\(name)]\nSau.")
        }
    }

    /// The production shape: the shopping block arrives BEFORE the prose.
    func testShoppingBlockBeforeProseLeavesCleanProse() {
        let reply = "[TAPPY_SHOPPING]\(body("TAPPY_SHOPPING"))[/TAPPY_SHOPPING]\n\nMình gợi ý cấu hình này."
        assertClean("early-emit", reply)
        XCTAssertEqual(ContentParser.parse(reply).text, "Mình gợi ý cấu hình này.")
    }

    func testFullReplyKeepsItsProse() {
        let reply = "[TAPPY_SHOPPING]\(body("TAPPY_SHOPPING"))[/TAPPY_SHOPPING]\n\n"
            + "Mình nghiêng về **MacBook Air M1** nhé.\n"
            + "[TAPPY_PLAN]\(body("TAPPY_PLAN"))[/TAPPY_PLAN]\n"
            + "[CTA_BUTTONS]\(body("CTA_BUTTONS"))[/CTA_BUTTONS]\n"
            + "[FOLLOWUPS]\(body("FOLLOWUPS"))"
        assertClean("full-reply", reply)
        XCTAssertTrue(ContentParser.parse(reply).text.contains("MacBook Air M1"))
    }

    // MARK: - Existing protocols must keep WORKING, not merely stop leaking
    //
    // Stripping is trivially achievable by deleting everything; these pin that each block is still
    // decoded into its model after the residue step was inserted into the chain.

    func testCtaButtonsStillDecoded() {
        let parsed = ContentParser.parse("Đi thử nhé.\n[CTA_BUTTONS]\(body("CTA_BUTTONS"))[/CTA_BUTTONS]")
        XCTAssertEqual(parsed.ctaButtons.count, 1)
        XCTAssertEqual(parsed.ctaButtons.first?.label, sentinel("CTA_BUTTONS"))
    }

    func testFollowupsStillDecoded() {
        let parsed = ContentParser.parse("Gợi ý đây.\n[FOLLOWUPS]\(body("FOLLOWUPS"))")
        XCTAssertEqual(parsed.followups, [sentinel("FOLLOWUPS"), "Có chỗ đậu xe không?", "Mở cửa mấy giờ?"])
    }

    func testValidPlanStillDecoded() {
        let planBody = #"{"type":"trip","title":"Đà Nẵng","days":[{"label":"Ngày 1","items":[]}]}"#
        let parsed = ContentParser.parse("Kế hoạch đây.\n[TAPPY_PLAN]\(planBody)[/TAPPY_PLAN]")
        XCTAssertEqual(parsed.plan?.days.count, 1)
    }

    func testReplyWithNoMarkersIsUnchanged() {
        XCTAssertEqual(ContentParser.parse("Quán này ngon lắm, bạn thử nhé!").text, "Quán này ngon lắm, bạn thử nhé!")
    }

    func testOrdinaryBracketsAreNotEaten() {
        // The strip patterns must key on the marker names, not on brackets in general.
        let reply = "Cú pháp là [key] và {value} nhé."
        XCTAssertEqual(ContentParser.parse(reply).text, reply)
    }
}
