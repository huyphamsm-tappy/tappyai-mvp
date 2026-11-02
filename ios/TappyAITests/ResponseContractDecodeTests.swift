import XCTest
@testable import TappyAI

/// Every screen's response must decode against what the server ACTUALLY sends, and one extra,
/// missing, renamed or malformed field must cost at most that field (or that one row) — never
/// the whole screen. See `LenientDecoding.swift` and TestFlight build 50 (30/09).
///
/// Bodies:
///  - PRODUCTION (captured 30/09 from https://www.tappyai.com, main f42ae4b, public GET routes):
///    `/api/reviews/feed`, `/api/deals`, `/api/suggested-prompts`. Keys, types and nesting are
///    verbatim; personal values (ids, names, media paths) are replaced.
///  - ROUTE SHAPE (authenticated routes cannot be fetched here): built key-for-key from the route
///    source on main f42ae4b — the `.select(...)` list and the `NextResponse.json({...})` literal.
final class ResponseContractDecodeTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try ResponseDecoder.json.decode(type, from: Data(json.utf8))
    }

    // MARK: - Production bodies

    func testProductionFeed() throws {
        let json = #"""
        {"reviews":[{"id":"r-1","user_id":"u-1","place_id":"video_1786609703441","place_name":"Chia sẻ","place_address":"","rating":5,"body":"Mì lòng heo","photos":[],"is_verified":false,"like_count":3,"comment_count":1,"save_count":0,"watch_time_avg":94.8,"completion_rate":0.8,"view_count":41,"content_type":"video","media_url":"https://storage.googleapis.com/bucket/videos/u-1/a.mp4","thumbnail":"https://storage.googleapis.com/bucket/thumbnails/u-1/a.jpg","hashtags":["#ăn","#đồăn"],"source_type":"upload","source_url":null,"created_at":"2026-09-20T08:00:00.123456+00:00","music":{"origin":"original","volume":1,"trackId":"t-1","version":1,"startSec":0},"profiles":{"full_name":"Người dùng","avatar_url":"https://x/a.png"},"liked_by_me":false,"saved_by_me":false,"is_following":false}],"page":0,"limit":12,"hasMore":false}
        """#
        let feed = try decode(FeedResponse.self, json)
        XCTAssertEqual(feed.reviews.count, 1)
        XCTAssertEqual(feed.limit, 12)
        let r = try XCTUnwrap(feed.reviews.first)
        XCTAssertTrue(r.isVideo)
        XCTAssertEqual(r.likeCount, 3)
        XCTAssertEqual(r.watchTimeAvg, 94.8)
        XCTAssertEqual(r.music?.trackId, "t-1")
        XCTAssertEqual(r.profiles?.fullName, "Người dùng")
    }

    func testProductionDeals() throws {
        let json = #"""
        {"success":true,"deals":[{"id":"d-1","partnerSlug":"shopee","partnerName":"Shopee","partnerType":"ecommerce","category":"Mua sắm","categoryKey":"Mua sắm","title":"Shopee","description":"Sàn mua sắm online","officialUrl":"https://shopee.vn","bannerImage":null,"logoImage":null,"isFeatured":true,"discountLabel":null,"voucherCode":null,"endAt":null}]}
        """#
        let deals = try decode(DealsResponse.self, json)
        XCTAssertEqual(deals.deals.first?.partnerName, "Shopee")
        XCTAssertEqual(deals.deals.first?.isFeatured, true)
    }

    func testProductionSuggestedPrompts() throws {
        let json = #"""
        {"prompts":[{"text":"Tối nay ăn gì?","textEn":"What's for dinner?","category":"food","emoji":"🍜","gradient":"from-a to-b"}],"hour":20,"dayOfWeek":2,"gender":null}
        """#
        XCTAssertEqual(try decode(SuggestedPromptsResponse.self, json).prompts.first?.emoji, "🍜")
    }

    // MARK: - Route shapes (main f42ae4b)

    func testProfileRouteShape() throws {
        // GET /api/profile — email/bio from the session, cover_url absent on production.
        let json = #"{"full_name":"An","avatar_url":"","email":"an@example.com","bio":"","language":null,"onboarded":true}"#
        let p = try decode(UserProfile.self, json)
        XCTAssertEqual(p.fullName, "An")
        XCTAssertNil(p.coverUrl)
    }

    func testProfileWithOnlyTheProfilesColumns() throws {
        // An older/lighter body (just the `profiles` select) must still open the hub.
        let p = try decode(UserProfile.self, #"{"full_name":"An","avatar_url":null,"created_at":"2026-01-01"}"#)
        XCTAssertEqual(p.fullName, "An")
        XCTAssertEqual(p.email, "")
        XCTAssertEqual(p.avatarUrl, "")
    }

    func testFavoritesRouteShape() throws {
        let json = #"{"favorites":[{"id":"f1","place_id":"p1","place_name":"Phở","place_address":"HN","place_type":"food","created_at":"2026-09-20T08:00:00Z"}]}"#
        XCTAssertEqual(try decode(PlacesService.FavoritesResponse.self, json).favorites.first?.placeId, "p1")
    }

    func testNotificationsRouteShape() throws {
        // `unread_count` (snake) and an extra `data` object the model does not read.
        let json = #"{"notifications":[{"id":"n1","type":"like","category":"social","title":"Lan thích bài của bạn","body":"","actor":{"id":"u2","name":"Lan","avatar":null},"entity_url":"/reviews/r1","image_url":null,"data":{"k":1},"read_at":null,"created_at":"2026-09-29T10:00:00Z"}],"unread_count":1}"#
        let n = try decode(NotificationsResponse.self, json)
        XCTAssertEqual(n.unreadCount, 1)
        XCTAssertEqual(n.notifications.first?.entityUrl, "/reviews/r1")
        XCTAssertTrue(n.notifications.first?.isUnread ?? false)
    }

    func testPublicUserRouteShape() throws {
        let json = #"{"id":"u1","full_name":"An","avatar_url":null,"follower_count":12,"following_count":"3","review_count":0,"is_following":false,"is_self":true}"#
        let u = try decode(PublicUserProfile.self, json)
        XCTAssertEqual(u.followerCount, 12)
        XCTAssertEqual(u.followingCount, 3, "a count serialised as a string still reads")
    }

    func testCommentsRouteShape() throws {
        let json = #"{"comments":[{"id":"c1","body":"Ngon","created_at":"2026-09-29T10:00:00Z","user_id":"u2","parent_comment_id":null,"profiles":{"full_name":"Lan","avatar_url":null},"reactions":{"like":2},"my_reaction":null}],"count":1}"#
        let c = try decode(CommentsResponse.self, json)
        XCTAssertEqual(c.comments.first?.body, "Ngon")
        XCTAssertEqual(c.count, 1)
    }

    func testConversationsRouteShapeIsABareArray() throws {
        let json = #"[{"id":"c1","title":"Đà Lạt","category":"general","updated_at":"2026-09-29T10:00:00.123456+00:00","messages":[{"role":"user","content":"hi"}]}]"#
        let items = try decode(LossyList<ChatHistoryItem>.self, json).items
        XCTAssertEqual(items.first?.messageCount, 1)
        XCTAssertEqual(try decode(LossyList<Conversation>.self, json).items.first?.messages.count, 1)
    }

    func testRecommendationsRouteShape() throws {
        let json = #"{"recommendations":[{"placeId":"p1","placeName":"Phở","finalScore":0.9,"matchedSignals":["food"],"rejectedSignals":[],"scoreBreakdown":{}}],"explanation":["Gần bạn"],"personalized":false,"confidence":0.4,"candidateCount":5}"#
        let r = try decode(PlacesService.RecommendationsResponse.self, json)
        XCTAssertEqual(r.recommendations.first?.placeName, "Phở")
        XCTAssertNil(r.recommendations.first?.averageRating, "a field production does not send yet stays nil")
    }

    // MARK: - One bad row costs one row

    func testOneMalformedReviewDropsOnlyThatReview() throws {
        let json = #"{"reviews":[{"id":"ok-1","created_at":"x"},{"no_id":true},{"id":"ok-2","like_count":"7"}],"page":0,"limit":12}"#
        let feed = try decode(FeedResponse.self, json)
        XCTAssertEqual(feed.reviews.map(\.id), ["ok-1", "ok-2"])
        XCTAssertEqual(feed.reviews.last?.likeCount, 7)
        XCTAssertEqual(feed.reviews.first?.likeCount, 0, "missing count reads as 0, not a failed feed")
    }

    func testMissingListIsEmptyNotAnError() throws {
        XCTAssertEqual(try decode(PlacesService.SavedReviewsResponse.self, "{}").reviews.count, 0)
        XCTAssertEqual(try decode(CollectionReviewListResponse.self, #"{"reviews":null}"#).reviews.count, 0)
        XCTAssertEqual(try decode(DealsResponse.self, #"{"success":true}"#).deals.count, 0)
    }

    func testFeedWithoutPaginationFieldsStillLoads() throws {
        let feed = try decode(FeedResponse.self, #"{"reviews":[{"id":"a"},{"id":"b"}]}"#)
        XCTAssertEqual(feed.page, 0)
        XCTAssertEqual(feed.limit, 2)
    }

    func testRequiredIdentityStillRequired() {
        XCTAssertThrowsError(try decode(Review.self, #"{"place_name":"x"}"#))
        XCTAssertThrowsError(try decode(PartnerDeal.self, #"{"id":"d","title":"x"}"#), "a deal with nowhere to go is not a deal")
    }

    func testSubscriptionQuotaIsNotInvented() {
        XCTAssertThrowsError(try decode(SubscriptionStatusResponse.self, #"{"isPro":false}"#))
        let ok = try? decode(SubscriptionStatusResponse.self,
                             #"{"isPro":false,"status":null,"freeDailyLimit":15,"isAnonymous":false,"todayMessageCount":"2","remaining":13}"#)
        XCTAssertEqual(ok?.todayMessageCount, 2)
    }

    func testRatesDropABadCurrencyOnly() throws {
        let r = try decode(RatesResponse.self, #"{"rates":{"USD":1,"VND":"oops","EUR":0.9},"date":null}"#)
        XCTAssertEqual(r.rates["EUR"], 0.9)
        XCTAssertNil(r.rates["VND"])
        XCTAssertFalse(r.fallback)
    }

    func testMemoryWithAMalformedBudgetEntry() throws {
        let json = #"{"memory":{"preferences":{"food":["phở"]},"budget":{"food":{"min":50000,"max":"150000"},"spa":"cheap"},"history":["a",1]}}"#
        let m = try XCTUnwrap(try decode(MemoryResponse.self, json).memory)
        XCTAssertEqual(m.budget["food"]?.max, 150_000)
        XCTAssertNil(m.budget["spa"])
        XCTAssertEqual(m.history, ["a"])
    }
}
