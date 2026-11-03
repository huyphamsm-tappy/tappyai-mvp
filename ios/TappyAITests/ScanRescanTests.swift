import XCTest
import UIKit
@testable import TappyAI

/// Web scan page: the scan button stays under the preview while an image is selected (also after a result), and is disabled only while scanning.
@MainActor
final class ScanRescanTests: XCTestCase {

    private func makeImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
    }

    func testButtonIsHiddenWithoutAnImageAndShownWithOne() {
        let vm = ScanViewModel(service: UtilityToolsService(api: MockAPIClient()))
        XCTAssertFalse(vm.showsScanButton)
        XCTAssertFalse(vm.canScan)
        vm.setImage(makeImage())
        XCTAssertTrue(vm.showsScanButton)
        XCTAssertTrue(vm.canScan)
    }

    func testButtonStaysAfterAResultAndAllowsAScanAgain() async {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"text":"Xin chào"}"#.utf8)
        let vm = ScanViewModel(service: UtilityToolsService(api: api))
        vm.setImage(makeImage())
        await vm.scan()
        XCTAssertTrue(vm.hasResult)
        XCTAssertTrue(vm.showsScanButton, "the old UI hid the button after a result, so a re-scan was impossible")
        XCTAssertTrue(vm.canScan)

        api.stubbed = Data(#"{"text":"Lần hai"}"#.utf8)
        await vm.scan()
        XCTAssertEqual(vm.extractedText, "Lần hai")
        XCTAssertEqual(api.sentEndpoints.count, 2)
    }

    func testClearingTheImageHidesTheButton() async {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"text":"x"}"#.utf8)
        let vm = ScanViewModel(service: UtilityToolsService(api: api))
        vm.setImage(makeImage())
        await vm.scan()
        vm.clear()
        XCTAssertFalse(vm.showsScanButton)
        XCTAssertFalse(vm.hasResult)
    }

    func testScanButtonWordingIsTheWebs() throws {
        func value(_ key: String, _ lang: String) throws -> String {
            let path = try XCTUnwrap(Bundle.main.path(forResource: lang, ofType: "lproj"))
            return try XCTUnwrap(Bundle(path: path)).localizedString(forKey: key, value: "MISSING", table: nil)
        }
        // src/lib/i18n/w3/scan.ts
        XCTAssertEqual(try value("scan.scanButton", "vi"), "Quét tài liệu")
        XCTAssertEqual(try value("scan.scanning", "vi"), "Đang đọc tài liệu...")
        XCTAssertEqual(try value("scan.scanButton", "en"), "Scan document")
        XCTAssertEqual(try value("scan.scanning", "en"), "Reading document...")
    }
}
