import XCTest
import CoreImage
@testable import TappyAI

/// The profile QR encodes the canonical public profile URL (web `/profile/qr`).
final class ProfileQRTests: XCTestCase {

    func testURLIsTheCanonicalPublicProfile() {
        XCTAssertEqual(ProfileQR.profileURL(userId: "3f2a-uuid")?.absoluteString,
                       "https://www.tappyai.com/users/3f2a-uuid")
    }

    func testNoURLWithoutAUserId() {
        XCTAssertNil(ProfileQR.profileURL(userId: nil))
        XCTAssertNil(ProfileQR.profileURL(userId: ""))
        XCTAssertNil(ProfileQR.profileURL(userId: "  "))
        XCTAssertNil(ProfileQR.profileURL(userId: "a/b"), "an id can never add a path segment")
    }

    func testURLIsShareableAndOpensInTheApp() throws {
        let url = try XCTUnwrap(ProfileQR.profileURL(userId: "u-1"))
        XCTAssertTrue(TappyShare.isShareableURL(url.absoluteString))
    }

    func testImageDecodesBackToTheURL() throws {
        let text = "https://www.tappyai.com/users/u-1"
        let image = try XCTUnwrap(ProfileQR.image(for: text))
        XCTAssertGreaterThan(image.size.width, 100, "scaled up, not the 1pt-per-module raw output")

        let ciImage = try XCTUnwrap(CIImage(image: image))
        let detector = try XCTUnwrap(CIDetector(ofType: CIDetectorTypeQRCode, context: nil,
                                                options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]))
        let decoded = detector.features(in: ciImage).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
        XCTAssertEqual(decoded, [text])
    }

    func testStringsExist() {
        for key in ["qr.title", "qr.scanHint", "qr.saveHint", "qr.share", "qr.failed"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
