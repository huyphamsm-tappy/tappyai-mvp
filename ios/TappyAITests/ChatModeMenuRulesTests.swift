import XCTest
@testable import TappyAI

/// The mode rules of the composer's "+" menu (web `ChatInterface.tsx`, `modeAccess.ts`; Android `ChatMode.kt`): a mode picked again
/// goes back to Auto, Deep Research is for one question, and only Deep Research is a menu item. The menu does not follow the plan on iOS
/// (App Review 3.1.1: the app reads no plan; the server runs a mode the plan lacks as Chat).
final class ChatModeMenuRulesTests: XCTestCase {

    func testPickingAnotherModeSelectsIt() {
        XCTAssertEqual(ChatMode.auto.picked(.deep), .deep)
    }

    func testPickingTheModeInUseGoesBackToAuto() {
        XCTAssertEqual(ChatMode.deep.picked(.deep), .auto)
    }

    func testDeepResearchIsForOneQuestionOnly() {
        XCTAssertEqual(ChatMode.deep.afterSend(), .auto)
    }

    func testEveryOtherModeStaysAfterASend() {
        for mode in [ChatMode.auto, .chat, .web, .think] {
            XCTAssertEqual(mode.afterSend(), mode, "\(mode)")
        }
    }

    func testTheMenuIsDeepResearchOnly() {
        XCTAssertEqual(ChatMode.menu, [.deep])
    }

}
