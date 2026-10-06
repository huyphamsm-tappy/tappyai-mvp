import XCTest
@testable import TappyAI

/// «Viết lại» keeps the topic (Web `handleReset`, components/VietContentForm.tsx: only result + error are cleared).
@MainActor
final class VietContentResetTests: XCTestCase {

    private func makeVM() -> VietContentViewModel {
        VietContentViewModel(service: UtilityToolsService(api: MockAPIClient()))
    }

    func testRewriteKeepsTheTopicAndOptionsButClearsTheResult() {
        let vm = makeVM()
        vm.topic = "Quán cà phê mới ở Đà Lạt"
        vm.platform = "tiktok"
        vm.tone = "funny"
        vm.length = "long"
        vm.caption = "caption"
        vm.hashtags = "#a #b"
        vm.error = "x"
        vm.reset()
        XCTAssertEqual(vm.topic, "Quán cà phê mới ở Đà Lạt")
        XCTAssertEqual(vm.platform, "tiktok")
        XCTAssertEqual(vm.tone, "funny")
        XCTAssertEqual(vm.length, "long")
        XCTAssertEqual(vm.caption, "")
        XCTAssertEqual(vm.hashtags, "")
        XCTAssertNil(vm.error)
        XCTAssertTrue(vm.canGenerate, "the user can generate again straight away")
    }

    func testClearStillEmptiesTheTopic() {
        let vm = makeVM()
        vm.topic = "abc"
        vm.clear()
        XCTAssertEqual(vm.topic, "")
    }
}
