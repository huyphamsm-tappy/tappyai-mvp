import XCTest
@testable import TappyAI

/// The Web has two tile-picture orders and iOS follows each surface (see `ReviewPoster`):
///  - own profile hub (`(app)/profile/ProfileView.tsx` ReviewGrid/ReviewList, `favorites/SavedView.tsx`): thumbnail, then photos[0]
///  - public profile / feed profile tab (`LinkPoster` -> `posterFor`): photos[0], then thumbnail
/// Fixture: a profile post that carries BOTH.
final class ReviewPosterSurfaceTests: XCTestCase {

    private let both = #"{"id":"p1","content_type":"photo","created_at":"2026-10-01T00:00:00Z","thumbnail":"https://x/thumb.jpg","photos":["https://x/photo1.jpg","https://x/photo2.jpg"]}"#

    private func review() throws -> Review { try ResponseDecoder.json.decode(Review.self, from: Data(both.utf8)) }
    private func collection() throws -> CollectionReview { try ResponseDecoder.json.decode(CollectionReview.self, from: Data(both.utf8)) }

    func testOwnProfileSurfacesShowTheThumbnailFirst() throws {
        let r = try review()
        XCTAssertEqual(ReviewPoster.url(photos: r.photos, thumbnail: r.thumbnail, order: .ownProfile), "https://x/thumb.jpg")
        let c = try collection()
        XCTAssertEqual(ReviewPoster.url(photos: c.photos, thumbnail: c.thumbnail, order: .ownProfile), "https://x/thumb.jpg")
    }

    func testPublicProfileSurfaceShowsThePhotoFirst() throws {
        let r = try review()
        XCTAssertEqual(ReviewPoster.url(photos: r.photos, thumbnail: r.thumbnail), "https://x/photo1.jpg")
        XCTAssertEqual(ReviewPoster.url(photos: r.photos, thumbnail: r.thumbnail, order: .poster), "https://x/photo1.jpg")
    }

    func testOwnProfileFallsBackToThePhotoAndSkipsBlanks() {
        XCTAssertEqual(ReviewPoster.url(photos: ["https://x/p.jpg"], thumbnail: nil, order: .ownProfile), "https://x/p.jpg")
        XCTAssertEqual(ReviewPoster.url(photos: ["https://x/p.jpg"], thumbnail: "  ", order: .ownProfile), "https://x/p.jpg")
        XCTAssertNil(ReviewPoster.url(photos: [], thumbnail: "", order: .ownProfile))
        XCTAssertNil(ReviewPoster.url(photos: nil, thumbnail: nil, order: .ownProfile))
    }
}
