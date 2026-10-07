import XCTest
@testable import TappyAI

/// The five personal collections on iOS (`OwnCollection`, `MyPostsViewModel`) — the same
/// product/data contract as Android's self profile and the web's `/profile` hub.
///
/// These run under Xcode only; the Windows build machine has no Swift toolchain, so the web
/// suite's `profileCollectionsParity.test.ts` pins the contract at source level as well.
@MainActor
final class OwnCollectionsTests: XCTestCase {

    // MARK: - Fixtures

    private func authenticatedSession() -> SessionStore {
        let store = SessionStore(storage: InMemoryTokenStorage(TestFixtures.tokens(expiresIn: 3600, sub: "u-1")))
        store.bootstrap()
        return store
    }

    /// An ANONYMOUS session that nevertheless carries a bearer token — the state the chat quota
    /// runs on. The gate must treat it as a guest.
    private func anonymousSessionWithToken() -> SessionStore {
        let store = SessionStore(storage: InMemoryTokenStorage())
        store.bootstrap()
        store.adoptAnonymousSession(TestFixtures.tokens(expiresIn: 3600, sub: "anon-1"), anonymousId: "anon-1")
        return store
    }

    private func makeViewModel(session: SessionStore, api: MockAPIClient) -> MyPostsViewModel {
        MyPostsViewModel(service: ReviewsService(api: api), session: session)
    }

    private static let minePayload = Data("""
    {"reviews":[
      {"id":"r1","user_id":"u-1","place_name":"Cà phê","body":"ngon","photos":null,"like_count":3,"comment_count":0,"save_count":0,
       "created_at":"2026-09-01T00:00:00Z","liked_by_me":false,"saved_by_me":false,"content_type":"photo","is_hidden":false},
      {"id":"r2-hidden","user_id":"u-1","place_name":"Quán","body":"private","photos":null,"like_count":1,"comment_count":0,"save_count":0,
       "created_at":"2026-08-20T00:00:00Z","liked_by_me":false,"saved_by_me":false,"content_type":"photo","is_hidden":true}
    ]}
    """.utf8)

    /// The compact shape `/liked`, `/saved` and `/shared` serve — no counts, no author.
    private static let likedPayload = Data("""
    {"reviews":[{"id":"l1","place_name":"Bún bò","body":null,"photos":["https://cdn/x.jpg"],"thumbnail":null,
      "content_type":"video","created_at":"2026-09-02T00:00:00Z","liked_at":"2026-09-16T10:00:00Z"}]}
    """.utf8)

    // MARK: - The contract

    func testTheFiveCollectionsInTheCanonicalOrder() {
        XCTAssertEqual(OwnCollection.allCases.map(\.rawValue), ["posts", "liked", "saved", "hidden", "shared"])
        for c in OwnCollection.allCases {
            XCTAssertEqual(c.titleKey, "collections.tab.\(c.rawValue)")
            XCTAssertEqual(c.emptyKey, "collections.empty.\(c.rawValue)")
        }
    }

    // MARK: - The gate

    func testAnonymousSessionRequestsNothingAndHoldsNothing() async {
        let api = MockAPIClient()
        api.stubbed = Self.likedPayload
        let vm = makeViewModel(session: anonymousSessionWithToken(), api: api)
        XCTAssertFalse(vm.isAuthenticated)

        for c in OwnCollection.allCases { await vm.load(c) }

        XCTAssertTrue(api.sentEndpoints.isEmpty, "a guest must not ask for private collections, token or no token")
        XCTAssertEqual(vm.postsState, .idle)
        XCTAssertEqual(vm.likedState, .idle)
        XCTAssertTrue(vm.posts.isEmpty && vm.liked.isEmpty && vm.saved.isEmpty && vm.shared.isEmpty)
    }

    func testSignOutClearsEveryCollection() async {
        let api = MockAPIClient()
        api.stubbed = Self.minePayload
        let session = authenticatedSession()
        let vm = makeViewModel(session: session, api: api)
        await vm.load(.posts)
        XCTAssertEqual(vm.posts.count, 2)

        session.logout()
        vm.clear()

        XCTAssertTrue(vm.posts.isEmpty)
        XCTAssertEqual(vm.postsState, .idle)
        XCTAssertFalse(vm.isAuthenticated)
        // …and the next load, still signed out, asks for nothing.
        let before = api.sentEndpoints.count
        await vm.load(.posts)
        XCTAssertEqual(api.sentEndpoints.count, before)
    }

    // MARK: - Sources

    func testPostsAndHiddenAreTheTwoHalvesOfMine() async {
        let api = MockAPIClient()
        api.stubbed = Self.minePayload
        let vm = makeViewModel(session: authenticatedSession(), api: api)

        await vm.load(.posts)

        XCTAssertEqual(api.sentEndpoints.map(\.path), ["/api/reviews/mine"])
        XCTAssertTrue(api.sentEndpoints[0].requiresAuth)
        XCTAssertEqual(vm.postsState, .loaded)
        XCTAssertEqual(vm.publicPosts.map(\.id), ["r1"])
        XCTAssertEqual(vm.hiddenPosts.map(\.id), ["r2-hidden"])

        // Hidden is not a second request.
        await vm.load(.hidden)
        XCTAssertEqual(api.sentEndpoints.count, 1)
        XCTAssertEqual(vm.state(of: .hidden), .loaded)
    }

    /// `/mine` sends `{ reviews }` with no `page`/`limit`. Decoding it as `FeedResponse` — which
    /// declares both required — threw on every load; `ReviewListResponse` is the fix.
    func testMineDecodesWithoutPageAndLimit() throws {
        let decoded = try ResponseDecoder.json.decode(ReviewListResponse.self, from: Self.minePayload)
        XCTAssertEqual(decoded.reviews.count, 2)
        XCTAssertEqual(decoded.reviews[1].isHidden, true)
        XCTAssertThrowsError(try ResponseDecoder.json.decode(FeedResponse.self, from: Self.minePayload),
                             "the feed shape must NOT be used for /mine")
    }

    func testLikedSavedSharedUseTheirOwnGatedRoutes() async {
        let api = MockAPIClient()
        api.stubbed = Self.likedPayload
        let vm = makeViewModel(session: authenticatedSession(), api: api)

        await vm.load(.liked)
        await vm.load(.saved)
        await vm.load(.shared)

        XCTAssertEqual(api.sentEndpoints.map(\.path), ["/api/reviews/liked", "/api/reviews/saved", "/api/reviews/shared"])
        XCTAssertTrue(api.sentEndpoints.allSatisfy { $0.requiresAuth })
        XCTAssertTrue(api.sentEndpoints.allSatisfy { $0.query.isEmpty }, "no user parameter — the routes are the bearer's own")
        XCTAssertEqual(vm.liked.map(\.id), ["l1"])
        XCTAssertEqual(vm.liked.first?.likedAt, "2026-09-16T10:00:00Z")
        XCTAssertTrue(vm.liked.first?.isVideo == true)
        XCTAssertEqual(vm.likedState, .loaded)
        XCTAssertEqual(vm.savedState, .loaded)
        XCTAssertEqual(vm.sharedState, .loaded)

        // Loaded once, kept: switching back costs no request.
        await vm.load(.liked)
        XCTAssertEqual(api.sentEndpoints.count, 3)
    }

    func testCompactRowsCannotBeMistakenForFullReviews() {
        XCTAssertThrowsError(try ResponseDecoder.json.decode(ReviewListResponse.self, from: Self.likedPayload),
                             "the compact collection row has no counts and no author; it is a CollectionReview")
        XCTAssertNoThrow(try ResponseDecoder.json.decode(CollectionReviewListResponse.self, from: Self.likedPayload))
    }

    func testAFailedLoadIsAFailedState() async {
        let api = MockAPIClient()
        api.stubbed = Data("not json".utf8)
        let vm = makeViewModel(session: authenticatedSession(), api: api)
        await vm.load(.saved)
        XCTAssertEqual(vm.savedState, .failed)
        XCTAssertTrue(vm.saved.isEmpty)
        // A retry re-reads.
        api.stubbed = Self.likedPayload
        await vm.reload(.saved)
        XCTAssertEqual(vm.savedState, .loaded)
        XCTAssertEqual(vm.saved.count, 1)
    }
}
