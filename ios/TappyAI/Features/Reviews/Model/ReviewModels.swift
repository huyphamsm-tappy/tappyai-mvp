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
        profiles?.fullName ?? "Người dùng"
    }

    var isShareOnly: Bool {
        guard let name = placeName else { return true }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        let shareNames = ["Chia sẻ", "Chia se"]
        return shareNames.contains(trimmed)
    }
}

struct ReviewComment: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let body: String
    let createdAt: String
    let userId: String
    let profiles: ReviewProfile?

    var displayName: String {
        profiles?.fullName ?? "Người dùng"
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

struct UserSearchResponse: Decodable, Sendable {
    let users: [UserSearchResult]
}

struct FeedResponse: Decodable, Sendable {
    let reviews: [Review]
    let page: Int
    let limit: Int
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
}

struct PostCommentResponse: Decodable, Sendable {
    let comment: ReviewComment
    let count: Int
}

struct DeleteCommentResponse: Decodable, Sendable {
    let ok: Bool
    let count: Int
}

struct FollowResponse: Decodable, Sendable {
    let following: Bool
    let followerCount: Int
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
