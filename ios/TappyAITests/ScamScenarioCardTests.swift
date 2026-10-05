import XCTest
@testable import TappyAI

/// The matched-scenario block of the message check, matched to the Web `ScenarioCard` (ScamMessageResult.tsx, web final):
/// heading «Tình huống tương ứng», «Kịch bản số N …», «Dấu hiệu nhận biết (theo bài viết)» and the TappyAI-wording note.
final class ScamScenarioCardTests: XCTestCase {

    private func string(_ key: String, _ lang: String) throws -> String {
        let path = try XCTUnwrap(Bundle.main.path(forResource: lang, ofType: "lproj"))
        let value = try XCTUnwrap(Bundle(path: path)).localizedString(forKey: key, value: "MISSING", table: nil)
        XCTAssertNotEqual(value, "MISSING", "\(key) [\(lang)]")
        return value
    }

    func testTheScenarioWordingIsTheWebs() throws {
        XCTAssertEqual(try string("scamVerdict.scenario.heading", "vi"), "Tình huống tương ứng")
        XCTAssertEqual(try string("scamVerdict.scenario.heading", "en"), "Matching scenario")
        XCTAssertEqual(try string("scamVerdict.scenario.signs", "vi"), "Dấu hiệu nhận biết (theo bài viết)")
        XCTAssertEqual(String(format: try string("scamVerdict.scenario.number", "vi"), "7"), "Kịch bản số 7 trong danh sách của Bộ Công an")
        XCTAssertEqual(String(format: try string("scamVerdict.scenario.number", "en"), "7"), "Scenario #7 in the Ministry of Public Security list")
        XCTAssertTrue(try string("scamVerdict.scenario.guidanceNote", "vi").hasPrefix("Phần dấu hiệu và lời khuyên do TappyAI biên soạn"))
    }

    // The Web's own fixtures (`match.test.ts`, owner 02/10): short descriptions with no link, no OTP and no demand verb.
    func testShortDescriptionsMatchTheirScenarioStrongly() {
        let fixtures: [(String, Int)] = [
            ("Cuộc gọi video người thân hình mờ, giật rồi tắt đột ngột, nói cần tiền gấp", 1),
            ("Giọng giống người quen nhưng gọi từ số lạ, nhờ chuyển tiền vay tạm", 2),
            ("Gọi điện im lặng, đầu dây không nói chuyện, chỉ hỏi \"A lô? Ai đấy?\"", 9),
            ("Người lạ xưng công an báo liên quan vụ án rửa tiền, đòi chuyển vào tài khoản tạm giữ", 3),
            ("Nhân viên ngân hàng báo giao dịch lạ và yêu cầu đọc mã OTP", 4),
            ("Báo SIM sắp bị khóa trong vài giờ nếu không chuẩn hóa thuê bao", 12),
            ("Thông báo nợ cước điện, dọa cắt điện trong vài giờ nếu không nộp cước", 17),
            ("Phạt nguội kèm link tra cứu, thúc nộp phạt ngay", 22),
            ("Việc nhẹ lương cao, làm nhiệm vụ đặt đơn ảo nhận hoa hồng", 14),
            ("Trúng thưởng chương trình bạn không tham gia, phải đóng phí vận chuyển", 23),
            ("Bưu phẩm Trung thu kèm mã QR", 19),
            ("Quà Tết gửi kèm mã QR lạ", 19),
            ("Kiện hàng bạn chưa đặt kèm mã QR bắt quét", 19),
        ]
        for (text, number) in fixtures {
            let m = ScamScenarioMatcher.best(text)
            XCTAssertEqual(m?.number, number, text)
            XCTAssertEqual(m?.strength, .strong, text)
            XCTAssertEqual(ScamMessageMatcher.analyze(text).verdict, .familiar, text)
        }
    }

    func testAWeakMatchIsSuspiciousWithTheScenarioShown() {
        // «hoàn tiền» alone scores 4 (weak) for scenario 13 and no request rule fires, so the verdict is «suspicious» with scenario 13 shown.
        let text = "Có người gọi điện yêu cầu tôi cung cấp thông tin CCCD để xử lý vấn đề hoàn tiền"
        XCTAssertEqual(ScamScenarioMatcher.best(text)?.strength, .weak)
        guard case .unsure(_, _, let scenario) = ScamMessageMatcher.analyze(text) else { return XCTFail("weak match = suspicious") }
        XCTAssertEqual(scenario, 13, "the matched scenario travels with the suspicious verdict")
    }

    func testTheOwnersCccdRefundDescriptionShowsAScenario() {
        // UAT build 123: «a person calls asking me to provide CCCD information to process a money-refund issue» showed no scenario.
        let text = "Có người gọi điện yêu cầu tôi cung cấp thông tin CCCD để xử lý vấn đề hoàn tiền"
        let outcome = ScamMessageMatcher.analyze(text)
        var number: Int?
        switch outcome {
        case .matched(let n, _, _): number = n
        case .unsure(_, _, let n): number = n
        case .familiar, .noSigns: break
        }
        XCTAssertNotNil(number, "no longer «no familiar signs» without a scenario: \(outcome)")
        XCTAssertNotEqual(outcome.verdict, .unrecognized)
    }

    func testEveryDatasetScenarioHasAPhraseList() {
        XCTAssertEqual(ScamScenarioMatcher.coveredNumbers, ScamKnowledge.load().scenarios.map(\.officialNumber).sorted())
    }

    func testOrdinaryMessagesStillMatchNothing() {
        for text in ["Chiều nay mình đi ăn phở nhé, 6 giờ ở chỗ cũ.", "Mai họp lúc 9h phòng 3, nhớ mang laptop.",
                     "Đơn hàng DH12345 đã giao thành công. Cảm ơn bạn đã mua sắm."] {
            XCTAssertNil(ScamScenarioMatcher.best(text), text)
        }
    }
}
