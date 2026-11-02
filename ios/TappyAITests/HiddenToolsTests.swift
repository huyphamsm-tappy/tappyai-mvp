import XCTest
@testable import TappyAI

/// Dịch and Viết nội dung are hidden (ProductFlags.showTranslate / showVietContent = false, owner
/// decision 2026-10-25). These tests pin the hidden state: the flags default off, the tool registry and
/// Home no longer offer the two tools, and the service never sends a request while they are off.
/// The API-side guard is covered by the backend test src/lib/config/hiddenTools.test.ts.
final class HiddenToolsTests: XCTestCase {

    func testFlagsDefaultToHidden() {
        XCTAssertFalse(ProductFlags.showTranslate)
        XCTAssertFalse(ProductFlags.showVietContent)
    }

    func testRegistryOmitsTranslateAndCaptionsWhileHidden() {
        let ids = SmartTool.all.map(\.id)
        XCTAssertFalse(ids.contains(.translate))
        XCTAssertFalse(ids.contains(.captions))
        // The other tools are untouched.
        XCTAssertTrue(ids.contains(.scan))
        XCTAssertTrue(ids.contains(.safety))
    }

    func testHomeCurationOmitsTranslateWhileHidden() {
        let ids = SmartTool.home.map(\.id)
        XCTAssertFalse(ids.contains(.translate))
        XCTAssertEqual(ids, [.safety, .scan, .currency, .split])
    }

    func testServiceSendsNothingWhileHidden() async {
        // The guard runs before consent and before any request. With the flag off the call must throw
        // without touching the API, so the mock client must record no endpoint.
        let api = MockAPIClient()
        let service = UtilityToolsService(api: api)
        do {
            _ = try await service.translate(text: "hello", targetLang: "vi")
            XCTFail("translate must not succeed while hidden")
        } catch {
            XCTAssertEqual((error as? AppError), .network(status: 404, code: "not_available"))
        }
        XCTAssertTrue(api.sentEndpoints.isEmpty)
    }
}
