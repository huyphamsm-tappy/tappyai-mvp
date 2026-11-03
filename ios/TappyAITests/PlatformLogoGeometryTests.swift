import XCTest
import SwiftUI
@testable import TappyAI

/// Geometry constants of the QR card platform chips (Web `brandedCard.ts`: `STORE_LOGO = 46`, text at `x + STORE_LOGO + 18`,
/// corner radius `s * 0.24`, Android `#3DDC84` / ink `#0B3D22`, Apple chip `#111111`). Pixel output needs a device render.
final class PlatformLogoGeometryTests: XCTestCase {
    func testConstantsMatchWeb() {
        XCTAssertEqual(PlatformLogo.side, 46)
        XCTAssertEqual(PlatformLogo.textGap, 18)
        XCTAssertEqual(PlatformLogo.cornerFraction, 0.24)
        XCTAssertEqual(PlatformLogo.androidGreen, 0x3DDC84)
        XCTAssertEqual(PlatformLogo.androidInk, 0x0B3D22)
        XCTAssertEqual(PlatformLogo.appleBlack, 0x111111)
    }

    func testRobotShapesStayInsideTheChip() {
        let rect = CGRect(x: 0, y: 0, width: PlatformLogo.side, height: PlatformLogo.side)
        for shape in [AndroidRobotHead().path(in: rect), AndroidRobotAntennae().path(in: rect), AndroidRobotEyes().path(in: rect)] {
            XCTAssertTrue(rect.contains(shape.boundingRect), "\(shape.boundingRect)")
        }
        // Dome spans x 0.22..0.78 and y 0.36..0.64 of the chip (Web arc, radius 0.28).
        let head = AndroidRobotHead().path(in: rect).boundingRect
        XCTAssertEqual(head.minX, 0.22 * 46, accuracy: 0.5)
        XCTAssertEqual(head.maxX, 0.78 * 46, accuracy: 0.5)
        XCTAssertEqual(head.minY, 0.36 * 46, accuracy: 0.5)
        XCTAssertEqual(head.maxY, 0.64 * 46, accuracy: 0.5)
    }
}
