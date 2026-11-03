import XCTest
@testable import TappyAI

/// The composer names a mode only where it is a choice (the menu item and the chip): Deep Research. Every menu mode has a name and a hint.
final class ChatModeMenuLabelsTests: XCTestCase {

    func testDeepResearchHasANameAndAHint() {
        XCTAssertEqual(ChatMode.deep.titleKey, "chat.mode.deep")
        XCTAssertEqual(ChatMode.deep.hintKey, "chat.mode.deepHint")
    }

    func testTheOtherModesHaveNoComposerName() {
        for mode in [ChatMode.auto, .chat, .web, .think] {
            XCTAssertNil(mode.titleKey, "\(mode)")
            XCTAssertNil(mode.hintKey, "\(mode)")
        }
    }

    func testEveryMenuModeIsNamed() {
        for mode in ChatMode.menu {
            XCTAssertNotNil(mode.titleKey, "\(mode)")
        }
    }
}
