import XCTest
@testable import TappyAI

/// The mode rules of the composer's "+" menu (web `ChatInterface.tsx`, `modeAccess.ts`; Android `ChatMode.kt`): a mode picked again
/// goes back to Auto, Deep Research is for one question, and only Deep Research is a menu item — for an account whose plan has it.
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

    func testUnknownPlanKeepsTheWholeMenu() {
        XCTAssertEqual(ChatMode.menuFor(nil), ChatMode.menu)
    }

    func testAVisitorGetsNoModeItem() {
        XCTAssertEqual(ChatMode.menuFor(PlanAccess(signedIn: false, state: "NONE", planId: nil)), [])
    }

    func testAnAccountWithoutALivePlanGetsNoModeItem() {
        for state in ["NONE", "EXPIRED", "CANCELLED", "PENDING"] {
            XCTAssertEqual(ChatMode.menuFor(PlanAccess(signedIn: true, state: state, planId: "coco")), [], state)
        }
    }

    func testTheFreePlanGetsNoModeItem() {
        XCTAssertEqual(ChatMode.menuFor(PlanAccess(signedIn: true, state: "ACTIVE", planId: "free")), [])
    }

    func testAPaidActivePlanKeepsTheWholeMenu() {
        for plan in ["coco", "promax1m", "promax3m"] {
            XCTAssertEqual(ChatMode.menuFor(PlanAccess(signedIn: true, state: "ACTIVE", planId: plan)), ChatMode.menu, plan)
        }
    }
}
