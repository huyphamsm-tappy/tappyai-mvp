import XCTest
@testable import TappyAI

/// "Who likes this" (web `GET /api/reviews/{id}/likes`).
final class ReviewLikersTests: XCTestCase {
    func testLikersKeepAPersonWithNoProfileAndDropABrokenRow() throws {
        let page = try ResponseDecoder.json.decode(LikersPage.self, from: Data("""
        {"likers":[{"id":"u1","full_name":"Lan","avatar_url":"https://x.example/a.jpg","created_at":"2026-11-01T00:00:00Z"},
                   {"id":"u2","full_name":null,"avatar_url":null},
                   {"full_name":"no id"}],
         "next_cursor":"2026-11-01T00:00:00Z"}
        """.utf8))
        XCTAssertEqual(page.likers.map(\.id), ["u1", "u2"])
        XCTAssertEqual(page.likers[0].displayName, "Lan")
        XCTAssertFalse(page.likers[1].displayName.isEmpty, "a liker with no name still shows a row")
        XCTAssertEqual(page.nextCursor, "2026-11-01T00:00:00Z")
    }

    func testLastPageHasNoCursor() throws {
        let page = try ResponseDecoder.json.decode(LikersPage.self, from: Data(#"{"likers":[],"next_cursor":null}"#.utf8))
        XCTAssertNil(page.nextCursor)
    }

    func testRequestUsesBeforeAndRefusesAnUnsafeId() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"likers":[]}"#.utf8)
        let service = ReviewsService(api: api)
        _ = try await service.fetchLikers(reviewId: "r1", before: "2026-11-01T00:00:00Z")
        XCTAssertEqual(api.sentEndpoints.first?.path, "/api/reviews/r1/likes")
        XCTAssertEqual(api.sentEndpoints.first?.query.first?.name, "before")
        do { _ = try await service.fetchLikers(reviewId: "../x"); XCTFail("unsafe id") } catch {}
        XCTAssertEqual(api.sentEndpoints.count, 1)
    }
}
