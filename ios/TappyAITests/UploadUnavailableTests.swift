import XCTest
@testable import TappyAI

/// Web 8c25bec: the upload-session route's 502 body carries `code: "upload_unavailable"`; `/api/profile` POST answers
/// 503 `{error: "upload_unavailable"}`. Everything else keeps its current handling.
final class UploadUnavailableTests: XCTestCase {
    private func data(_ s: String) -> Data { Data(s.utf8) }

    func testSessionRoute502WithCode() {
        let body = data(#"{"error":"Không thể tạo phiên tải lên. Vui lòng thử lại.","code":"upload_unavailable"}"#)
        XCTAssertTrue(UploadUnavailable.matches(status: 502, data: body))
        XCTAssertEqual(APIClient.mapHTTP(status: 502, data: body), .network(status: 502, code: "upload_unavailable"))
        XCTAssertTrue(UploadUnavailable.matches(APIClient.mapHTTP(status: 502, data: body)))
    }

    func testProfile503WithErrorField() {
        let body = data(#"{"error":"upload_unavailable","message":"x"}"#)
        XCTAssertTrue(UploadUnavailable.matches(status: 503, data: body))
        XCTAssertTrue(UploadUnavailable.matches(APIClient.mapHTTP(status: 503, data: body)))
    }

    func testOther502IsNotUnavailable() {
        let body = data(#"{"error":"Không thể tạo phiên tải lên. Vui lòng thử lại."}"#)
        XCTAssertFalse(UploadUnavailable.matches(status: 502, data: body))
        XCTAssertFalse(UploadUnavailable.matches(APIClient.mapHTTP(status: 502, data: body)))
    }

    func testWrongStatusIsNotUnavailable() {
        XCTAssertFalse(UploadUnavailable.matches(status: 500, data: data(#"{"code":"upload_unavailable"}"#)))
    }

    func testMalformedBody() {
        XCTAssertFalse(UploadUnavailable.matches(status: 502, data: data("<html>Bad Gateway</html>")))
        XCTAssertFalse(UploadUnavailable.matches(status: 503, data: Data()))
        XCTAssertFalse(UploadUnavailable.matches(status: 502, data: data(#"["upload_unavailable"]"#)))
    }

    func testNonNetworkErrors() {
        XCTAssertFalse(UploadUnavailable.matches(AppError.offline))
        XCTAssertFalse(UploadUnavailable.matches(AppError.unexpected(message: "upload_unavailable")))
    }
}
