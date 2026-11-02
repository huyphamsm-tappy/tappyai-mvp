import XCTest
@testable import TappyAI

/// What the composer accepts as an attachment (web `composerAttachment.ts` checkAttachment; Android `Attachments.kt` attachmentCheck):
/// a PNG / JPEG / WEBP / GIF picture, or a PDF up to 3 000 000 bytes; nothing else. The server's own bounds (clientInput.ts) are applied
/// when the picture is prepared, not here: the web checks no picture size either.
final class ChatAttachmentRulesTests: XCTestCase {

    func testTheFourPictureTypesAreAccepted() {
        for mime in ["image/png", "image/jpeg", "image/webp", "image/gif"] {
            XCTAssertEqual(attachmentCheck(mime: mime, byteCount: 9_000_000), .ok(.image), mime)
        }
    }

    func testAPictureIsNeverRefusedForItsSize() {
        XCTAssertEqual(attachmentCheck(mime: "image/jpeg", byteCount: 0), .ok(.image))
        XCTAssertEqual(attachmentCheck(mime: "image/png", byteCount: Int.max), .ok(.image))
    }

    func testAPdfUpToThreeMillionBytesIsAccepted() {
        XCTAssertEqual(attachmentCheck(mime: "application/pdf", byteCount: 3_000_000), .ok(.pdf))
        XCTAssertEqual(attachmentCheck(mime: "application/pdf", byteCount: 1), .ok(.pdf))
        XCTAssertEqual(attachmentCheck(mime: "application/pdf", byteCount: 0), .ok(.pdf))
    }

    func testAPdfOverTheLimitIsRefusedAsTooLarge() {
        XCTAssertEqual(attachmentCheck(mime: "application/pdf", byteCount: 3_000_001), .pdfTooLarge)
        XCTAssertEqual(attachmentCheck(mime: "application/pdf", byteCount: 50_000_000), .pdfTooLarge)
    }

    func testAnyOtherTypeIsUnsupported() {
        for mime in ["image/heic", "image/svg+xml", "image/tiff", "application/zip", "text/plain", "video/mp4", "application/msword", ""] {
            XCTAssertEqual(attachmentCheck(mime: mime, byteCount: 10), .unsupported, mime)
        }
        XCTAssertEqual(attachmentCheck(mime: nil, byteCount: 10), .unsupported)
    }

    func testAnUnsupportedTypeStaysUnsupportedWhateverItsSize() {
        XCTAssertEqual(attachmentCheck(mime: "application/zip", byteCount: 3_000_001), .unsupported)
    }

    func testTheTypeIsReadWithoutRegardToCase() {
        XCTAssertEqual(attachmentCheck(mime: "Application/PDF", byteCount: 10), .ok(.pdf))
        XCTAssertEqual(attachmentCheck(mime: "IMAGE/PNG", byteCount: 10), .ok(.image))
    }

    func testARefusalNamesTheMessageToShowAndAnAcceptedFileNamesNone() {
        XCTAssertEqual(AttachmentCheck.unsupported.errorKey, "chat.attach.unsupported")
        XCTAssertEqual(AttachmentCheck.pdfTooLarge.errorKey, "chat.attach.pdfTooLarge")
        XCTAssertNil(AttachmentCheck.ok(.pdf).errorKey)
        XCTAssertNil(AttachmentCheck.ok(.image).errorKey)
    }

    func testThePdfLimitIsTheWebsAndTheServers() {
        XCTAssertEqual(ChatAttachmentLimits.pdfBytes, 3_000_000)
    }
}
