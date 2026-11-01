import XCTest
@testable import TappyAI

/// 02/11 (iOS = web `UserMessageCopy` and Android `UserMessageCopyButton`): a question the person sent has a copy button under its
/// bubble; the answers already had theirs. It copies what was typed, untouched.
final class UserMessageCopyTests: XCTestCase {
    func testTheCopiedTextIsExactlyWhatWasTyped() {
        XCTAssertEqual(userCopyText("Giá vé Đà Lạt?"), "Giá vé Đà Lạt?")
        XCTAssertEqual(userCopyText("  dòng 1\n\ndòng 2  \n"), "  dòng 1\n\ndòng 2  \n", "no trimming, no rewriting")
        XCTAssertEqual(userCopyText("**không phải markdown**"), "**không phải markdown**", "a question is not turned into plain text")
    }

    func testABlankQuestionHasNothingToCopy() {
        XCTAssertNil(userCopyText(""))
        XCTAssertNil(userCopyText("   "))
        XCTAssertNil(userCopyText("\n\t \n"))
    }

    func testTheUserBubbleCarriesTheCopyButton() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let list = try String(contentsOf: root.appendingPathComponent("TappyAI/Features/Chat/UI/ChatMessageList.swift"), encoding: .utf8)
        let bubble = try XCTUnwrap(list.range(of: "private struct UserBubble"))
        let assistant = try XCTUnwrap(list.range(of: "private struct AssistantBubble"))
        XCTAssertTrue(list[bubble.lowerBound..<assistant.lowerBound].contains("UserMessageCopyButton(text: content)"))
    }
}
