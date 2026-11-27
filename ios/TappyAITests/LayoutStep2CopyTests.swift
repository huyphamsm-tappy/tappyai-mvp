import XCTest
@testable import TappyAI

/// Layout step 2 (owner spec 26/11, §D «trạng thái luồng»): the wording of the stream's end states is fixed in the spec and must not drift.
/// These read the Vietnamese catalogue from the source tree, so a changed sentence fails the build instead of reaching a device.
final class LayoutStep2CopyTests: XCTestCase {

    private let catalogue: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("TappyAI/Resources/Localizable.xcstrings")

    private func vietnamese(_ key: String) throws -> String {
        let data = try Data(contentsOf: catalogue)
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        let entry = try XCTUnwrap(strings[key] as? [String: Any], "missing key \(key)")
        let loc = try XCTUnwrap(entry["localizations"] as? [String: Any])
        let vi = try XCTUnwrap(loc["vi"] as? [String: Any])
        let unit = try XCTUnwrap(vi["stringUnit"] as? [String: Any])
        return try XCTUnwrap(unit["value"] as? String)
    }

    func testAnIncompleteReplyWordsAreTheSpecs() throws {
        XCTAssertEqual(try vietnamese(ChatEndNotice.incomplete.messageKey),
                       "Câu trả lời có thể chưa đầy đủ. Bạn hỏi tiếp để mình viết thêm nhé.")
    }

    func testAnInterruptedReplyWordsAreTheSpecs() throws {
        XCTAssertEqual(try vietnamese(ChatEndNotice.interrupted.messageKey),
                       "Câu trả lời bị gián đoạn giữa chừng. Phần trên là những gì đã nhận được — bạn có thể hỏi lại.")
    }

    func testAConnectionLostReplyWordsAreTheSpecs() throws {
        XCTAssertEqual(try vietnamese(ChatEndNotice.connectionLost.messageKey),
                       "Câu trả lời bị ngắt giữa chừng. Bạn thử lại nhé?")
    }

    func testTheRetryAndLoadButtonsAreNamedAsTheSpec() throws {
        XCTAssertEqual(try vietnamese("chat.streamCutRetry"), "Trả lời lại")
        XCTAssertEqual(try vietnamese("chat.recover"), "Tải câu trả lời")
    }
}
