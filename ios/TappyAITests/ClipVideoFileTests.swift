import XCTest
@testable import TappyAI

/// Only a clip uploaded to TappyAI shares as its video file; everything else shares the card.
final class ClipVideoFileTests: XCTestCase {
    private func review(_ json: String) throws -> Review {
        try ResponseDecoder.json.decode(Review.self, from: Data(json.utf8))
    }

    func testUploadedClipSharesItsVideo() throws {
        let r = try review(#"{"id":"r1","content_type":"video","source_type":"upload","media_url":"https://storage.googleapis.com/b/v.mp4"}"#)
        XCTAssertEqual(ClipVideoFile.sourceURL(of: r)?.lastPathComponent, "v.mp4")
    }

    func testLinkedVideoAndPhotosDoNot() throws {
        XCTAssertNil(ClipVideoFile.sourceURL(of: try review(#"{"id":"r2","content_type":"video","source_type":"youtube","media_url":"https://youtube.com/x"}"#)))
        XCTAssertNil(ClipVideoFile.sourceURL(of: try review(#"{"id":"r3","content_type":"photo","source_type":"upload","media_url":"https://x/p.jpg"}"#)))
        XCTAssertNil(ClipVideoFile.sourceURL(of: try review(#"{"id":"r4","content_type":"video","source_type":"upload","media_url":"http://x/v.mp4"}"#)), "https only")
    }
}
