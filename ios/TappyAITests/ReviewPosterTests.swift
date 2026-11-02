import XCTest
@testable import TappyAI

/// The picture a profile tile shows for a post: Web `posterFor` (`src/lib/links/platforms.ts`) — a real photo, then the stored thumbnail, then a
/// placeholder. Fixtures are the shapes `GET /api/reviews/feed` returns (the two production clips have `photos: []` and a GCS `thumbnail`).
final class ReviewPosterTests: XCTestCase {

    private func review(_ json: String) throws -> Review {
        try ResponseDecoder.json.decode(Review.self, from: Data(json.utf8))
    }

    func testAClipShowsItsOwnThumbnail() throws {
        let r = try review(#"{"id":"r1","content_type":"video","source_type":"upload","media_url":"https://storage.googleapis.com/b/videos/v.mp4","thumbnail":"https://storage.googleapis.com/b/thumbnails/t1.jpg","photos":[]}"#)
        XCTAssertEqual(ReviewPoster.url(photos: r.photos, thumbnail: r.thumbnail), "https://storage.googleapis.com/b/thumbnails/t1.jpg")
    }

    func testAPhotoWinsOverTheThumbnailAsOnTheWeb() throws {
        let r = try review(#"{"id":"r2","content_type":"photo","thumbnail":"https://x/t.jpg","photos":["https://x/p1.jpg","https://x/p2.jpg"]}"#)
        XCTAssertEqual(ReviewPoster.url(photos: r.photos, thumbnail: r.thumbnail), "https://x/p1.jpg")
    }

    func testBlankValuesAreSkippedAndNothingIsInvented() throws {
        XCTAssertEqual(ReviewPoster.url(photos: ["  "], thumbnail: " https://x/t.jpg "), "https://x/t.jpg")
        XCTAssertNil(ReviewPoster.url(photos: nil, thumbnail: nil))
        XCTAssertNil(ReviewPoster.url(photos: [], thumbnail: ""))
    }

    func testTwoPostsNeverShareAPicture() throws {
        let a = try review(#"{"id":"a","content_type":"video","thumbnail":"https://x/a.jpg","photos":[]}"#)
        let b = try review(#"{"id":"b","content_type":"video","thumbnail":"https://x/b.jpg","photos":[]}"#)
        XCTAssertNotEqual(ReviewPoster.url(photos: a.photos, thumbnail: a.thumbnail), ReviewPoster.url(photos: b.photos, thumbnail: b.thumbnail))
    }
}
