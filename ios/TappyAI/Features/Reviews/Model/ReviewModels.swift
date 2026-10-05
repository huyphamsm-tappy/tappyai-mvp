import Foundation

struct ReviewProfile: Codable, Sendable, Hashable {
    let fullName: String?
    let avatarUrl: String?
}

struct ReviewMusic: Codable, Sendable, Hashable {
    let trackId: String?
    let title: String?
    let artist: String?
}

struct Review: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let userId: String?
    let placeName: String?
    let placeAddress: String?
    let rating: Double?
    let body: String?
    let photos: [String]?
    var likeCount: Int
    var commentCount: Int
    var saveCount: Int
    let createdAt: String
    var likedByMe: Bool
    var savedByMe: Bool
    let profiles: ReviewProfile?
    let contentType: String?
    let mediaUrl: String?
    let thumbnail: String?
    let sourceType: String?
    let sourceUrl: String?
    let hashtags: [String]?
    let watchTimeAvg: Double?
    let score: Double?
    let music: ReviewMusic?
    /// The safety gate's outcome, present ONLY on the author's own posts.
    ///
    /// The backend attaches it by IDENTITY, never by request shape — `GET /api/reviews/mine` is
    /// self-scoped by construction, and the feed's own-profile branch compares the session user
    /// against the requested one. So a row carrying this is a row about the reader's own post,
    /// and a row without it says nothing about anyone else's.
    ///
    /// Rendered by `MyPostsView`, which is the author's own view of their posts.
    let moderation: ReviewModeration?
    /// The author hid this themselves.
    ///
    /// 🚨 NOT the same thing as [moderation]. Hiding is the author's OWN choice and they can undo
    /// it; a moderation hold is the platform's and they cannot. Presenting one as the other would
    /// tell someone their post is hidden by their own hand when it is not. Only
    /// `GET /api/reviews/mine` returns this — the public feed excludes hidden rows entirely.
    let isHidden: Bool?

    var isVideo: Bool {
        contentType == "video" && mediaUrl != nil
    }

    var isPhoto: Bool {
        contentType == "photo" || (!(photos?.isEmpty ?? true))
    }

    var displayName: String {
        profiles?.fullName ?? NSLocalizedString("search.user.unnamed", comment: "")
    }

    var isShareOnly: Bool {
        guard let name = placeName else { return true }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        let shareNames = ["Chia sẻ", "Chia se"]
        return shareNames.contains(trimmed)
    }
}

/// Lenient decoding (see `LenientDecoding.swift`): only `id` is required. Counts and viewer flags
/// default to 0 / false — the way a row looked before the field existed; nothing is asserted.
/// In an extension so the memberwise initialiser stays available.
extension Review {
    enum CodingKeys: String, CodingKey {
        case id, userId, placeName, placeAddress, rating, body, photos, likeCount, commentCount, saveCount
        case createdAt, likedByMe, savedByMe, profiles, contentType, mediaUrl, thumbnail, sourceType
        case sourceUrl, hashtags, watchTimeAvg, score, music, moderation, isHidden
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        userId = c.lenient(String.self, forKey: .userId)
        placeName = c.lenient(String.self, forKey: .placeName)
        placeAddress = c.lenient(String.self, forKey: .placeAddress)
        rating = c.lenientDouble(forKey: .rating)
        body = c.lenient(String.self, forKey: .body)
        photos = c.lenient([String].self, forKey: .photos)
        likeCount = c.lenientInt(forKey: .likeCount) ?? 0
        commentCount = c.lenientInt(forKey: .commentCount) ?? 0
        saveCount = c.lenientInt(forKey: .saveCount) ?? 0
        createdAt = c.lenient(String.self, forKey: .createdAt, default: "")
        likedByMe = c.lenient(Bool.self, forKey: .likedByMe, default: false)
        savedByMe = c.lenient(Bool.self, forKey: .savedByMe, default: false)
        profiles = c.lenient(ReviewProfile.self, forKey: .profiles)
        contentType = c.lenient(String.self, forKey: .contentType)
        mediaUrl = c.lenient(String.self, forKey: .mediaUrl)
        thumbnail = c.lenient(String.self, forKey: .thumbnail)
        sourceType = c.lenient(String.self, forKey: .sourceType)
        sourceUrl = c.lenient(String.self, forKey: .sourceUrl)
        hashtags = c.lenient([String].self, forKey: .hashtags)
        watchTimeAvg = c.lenientDouble(forKey: .watchTimeAvg)
        score = c.lenientDouble(forKey: .score)
        music = c.lenient(ReviewMusic.self, forKey: .music)
        moderation = c.lenient(ReviewModeration.self, forKey: .moderation)
        isHidden = c.lenient(Bool.self, forKey: .isHidden)
    }
}

struct ReviewComment: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let body: String
    let createdAt: String
    let userId: String
    let profiles: ReviewProfile?
    /// Web `GET /api/reviews/{id}/comments`: the comment this one replies to (one level of thread), nil for a top-level comment.
    var parentCommentId: String? = nil
    /// Reaction key → how many people chose it (`like`, `love`, `haha`, `wow`, `sad`, `angry`).
    var reactions: [String: Int] = [:]
    /// The caller's own reaction key, if any.
    var myReaction: String? = nil

    var displayName: String {
        profiles?.fullName ?? NSLocalizedString("search.user.unnamed", comment: "")
    }
}

/// One row of `GET /api/users/search?q=` — the people search Web and Android both have.
///
/// `isFollowing` is computed server-side FOR THE CALLER, so the button state is correct on first
/// paint instead of after a second round trip. Snake-case keys are converted by the shared
/// decoder's `convertFromSnakeCase`, the same as every other response here.
struct UserSearchResult: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let fullName: String?
    let avatarUrl: String?
    let followerCount: Int?
    let followingCount: Int?
    let isFollowing: Bool?

    var displayName: String {
        let trimmed = fullName?.trimmingCharacters(in: .whitespaces) ?? ""
        return trimmed.isEmpty ? NSLocalizedString("search.user.unnamed", comment: "") : trimmed
    }
}

extension ReviewComment {
    enum CodingKeys: String, CodingKey { case id, body, createdAt, userId, profiles, parentCommentId, reactions, myReaction }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        body = c.lenient(String.self, forKey: .body, default: "")
        createdAt = c.lenient(String.self, forKey: .createdAt, default: "")
        userId = c.lenient(String.self, forKey: .userId, default: "")
        profiles = c.lenient(ReviewProfile.self, forKey: .profiles)
        parentCommentId = c.lenient(String.self, forKey: .parentCommentId)
        reactions = c.lenient([String: Int].self, forKey: .reactions, default: [:])
        myReaction = c.lenient(String.self, forKey: .myReaction)
    }
}

struct UserSearchResponse: Decodable, Sendable {
    let users: [UserSearchResult]

    enum CodingKeys: String, CodingKey { case users }
    init(users: [UserSearchResult]) { self.users = users }
    init(from decoder: Decoder) throws {
        users = try decoder.container(keyedBy: CodingKeys.self).lossyArray(UserSearchResult.self, forKey: .users)
    }
}

struct FeedResponse: Decodable, Sendable {
    let reviews: [Review]
    let page: Int
    let limit: Int

    enum CodingKeys: String, CodingKey { case reviews, page, limit }
    init(reviews: [Review], page: Int, limit: Int) { self.reviews = reviews; self.page = page; self.limit = limit }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        reviews = c.lossyArray(Review.self, forKey: .reviews)
        page = c.lenientInt(forKey: .page) ?? 0
        // Unknown page size: the rows that arrived are the page (pagination then asks once more).
        limit = c.lenientInt(forKey: .limit) ?? max(reviews.count, 1)
    }
}

struct LikeResponse: Decodable, Sendable {
    let liked: Bool
}

struct SaveResponse: Decodable, Sendable {
    let saved: Bool
}

struct CommentsResponse: Decodable, Sendable {
    let comments: [ReviewComment]
    let count: Int

    enum CodingKeys: String, CodingKey { case comments, count }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        comments = c.lossyArray(ReviewComment.self, forKey: .comments)
        count = c.lenientInt(forKey: .count) ?? comments.count
    }
}

struct PostCommentResponse: Decodable, Sendable {
    let comment: ReviewComment
    let count: Int

    enum CodingKeys: String, CodingKey { case comment, count }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        comment = try c.decode(ReviewComment.self, forKey: .comment)
        count = c.lenientInt(forKey: .count) ?? 0
    }
}

struct DeleteCommentResponse: Decodable, Sendable {
    let ok: Bool
    let count: Int

    enum CodingKeys: String, CodingKey { case ok, count }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // A 2xx is the success signal; `ok` only confirms it.
        ok = c.lenient(Bool.self, forKey: .ok, default: true)
        count = c.lenientInt(forKey: .count) ?? 0
    }
}

struct FollowResponse: Decodable, Sendable {
    let following: Bool
    let followerCount: Int

    enum CodingKeys: String, CodingKey { case following, followerCount }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        following = try c.decode(Bool.self, forKey: .following)
        followerCount = c.lenientInt(forKey: .followerCount) ?? 0
    }
}

// MARK: - Report a review

/// `POST /api/reviews/[id]/report` reasons — the server's whitelist, in web's menu order
/// (`src/lib/reviews/reportReasons.ts`). No free-text field exists.
/// Named apart from Music's `ReportReason`, a different endpoint with a different list.
enum ReviewReportReason: String, CaseIterable, Sendable, Identifiable {
    case spam, harassment, inappropriate, copyright, misinformation, violence, other

    var id: String { rawValue }
    var labelKey: String { "review.report.reason.\(rawValue)" }
}

/// `{ ok, reported, alreadyReported? }` — a repeat report of the same reason is a 200 too.
struct ReviewReportResponse: Decodable, Sendable {
    let ok: Bool?
    let reported: Bool?
    let alreadyReported: Bool?
}

/// What the reporter is told (web `alert(reportThanks | reportFailed)`). A duplicate counts as
/// sent. Any failure — including a server without the route (404) or an anonymous session
/// (403 `account_required`) — is "couldn't send", never a crash or a silent no-op.
enum ReviewReportOutcome: Equatable, Sendable {
    case sent
    case failed

    static func from(_ result: Result<ReviewReportResponse, Error>) -> ReviewReportOutcome {
        if case .success = result { return .sent }
        return .failed
    }

    var messageKey: String { self == .sent ? "review.report.thanks" : "review.report.failed" }
}

enum FeedSort: String, CaseIterable, Sendable {
    case trending
    case latest
}

enum FeedTab: Hashable, Sendable {
    case following
    case forYou
    case latest
}
