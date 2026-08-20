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
    /// 🔴 iOS has no own-posts screen yet, so nothing renders this today. It is decoded now
    /// because the field is part of the response contract the other two clients already honour,
    /// and because the screen that will render it (V2 iOS parity) must not have to rediscover
    /// that a post can exist without being public.
    let moderation: ReviewModeration?

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
