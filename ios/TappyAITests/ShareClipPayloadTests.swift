import XCTest
@testable import TappyAI

/// What iOS hands to Zalo and the other apps for a clip. The preview those apps draw is built from the Open Graph tags of THIS url on the Web
/// (production `GET /reviews/{id}` — `og:image` is `og/tappyai-v2.png` while the clip has a `thumbnail`), so the url is what iOS controls.
final class ShareClipPayloadTests: XCTestCase {

    func testTheSharedLinkIsTheCanonicalClipPage() {
        let id = "9d4cdf3b-a93f-427c-880a-9950472e3705"
        XCTAssertEqual(TappyShare.reviewURL(id), "https://www.tappyai.com/reviews/9d4cdf3b-a93f-427c-880a-9950472e3705")
        XCTAssertNotNil(URL(string: TappyShare.reviewURL(id)))
    }

    func testAnUploadedClipAlsoSharesItsVideoFileAndALinkOnlyShareIsTheUrl() throws {
        let clip = try ResponseDecoder.json.decode(Review.self, from: Data(#"{"id":"c1","content_type":"video","source_type":"upload","media_url":"https://storage.googleapis.com/b/videos/v.mp4","thumbnail":"https://storage.googleapis.com/b/thumbnails/t.jpg"}"#.utf8))
        XCTAssertEqual(ClipVideoFile.sourceURL(of: clip)?.lastPathComponent, "v.mp4")
        XCTAssertEqual(TappyShare.reviewURL(clip.id), "https://www.tappyai.com/reviews/c1")
    }
}
