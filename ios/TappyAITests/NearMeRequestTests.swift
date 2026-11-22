import XCTest
@testable import TappyAI

/// The "near me" detector is the web's (`isNearMeRequest`, `src/lib/location/currentLocation.ts`; its tests `currentLocation.test.ts` and
/// `currentLocationNearMePhrases.test.ts`, Round 42, allowlist approved by Huy 13/10/2026). A matching question goes out with a NEW device fix.
final class NearMeRequestTests: XCTestCase {

    func testTheApprovedPhrasesMatch() {
        let yes = ["quán phở gần tôi", "Gần mình có quán cafe nào", "tiệm sửa xe gần chỗ tôi", "ATM gần chỗ mình", "quanh đây có gì ăn",
                   "xung quanh đây có spa không", "coffee near me", "nearby pho", "food around here",
                   "quán phở gần tui", "quan pho gan tui", "cafe quanh tôi", "xung quanh tôi có gì ăn", "quán nào quanh mình",
                   "coffee near here", "food around me", "NEAR ME", "Quán Phở GẦN TÔI"]
        for t in yes { XCTAssertTrue(NearMeRequest.matches(t), t) }
    }

    func testTheLookAlikesDoNotMatch() {
        let no = ["phim gần đây có gì hay", "quán phở ở Quận 3", "quán ăn gần chợ Bến Thành", "xung quanh Hồ Gươm có gì chơi", "quán ăn gần nhà",
                  "quán cafe view đẹp", "", "quán phở xung quanh Hồ Gươm", "xung quanh Quận 1 có quán nào", "quanh Minh Khai có quán nào",
                  "quán nào mở quanh tối nay", "gần tuần sau mình đi Đà Lạt", "around meeting time",
                  "quán gần em", "quán gần nhất", "gần đây có quán nào", "quán gần công ty", "quan gan t", "close to me", "close by"]
        for t in no { XCTAssertFalse(NearMeRequest.matches(t), t) }
    }

    func testToneMarksDecideTheMarkedPhrases() {
        XCTAssertTrue(NearMeRequest.matches("quanh mình có gì"))
        XCTAssertFalse(NearMeRequest.matches("quanh minh có gì"), "without the tone mark it is a name (quanh Minh Khai)")
        XCTAssertTrue(NearMeRequest.matches("quanh tôi có gì"))
        XCTAssertFalse(NearMeRequest.matches("quanh toi có gì"), "without the tone mark it can be 'quanh tối'")
    }
}
