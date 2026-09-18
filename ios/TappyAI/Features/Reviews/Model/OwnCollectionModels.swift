import Foundation

/// The signed-in user's own collections — the cross-platform contract, in the canonical order.
///
/// Android: `CreatorProfileTab { Posts, Liked, Saved, Hidden, Shared }` (`SelfProfileScreen.kt`);
/// web: `OWN_PROFILE_COLLECTIONS` (`src/app/profile/ProfileView.tsx`). The web suite's
/// `profileCollectionsParity.test.ts` reads this enum from source and pins all three, so a case
/// added or reordered here without the other two fails the build on the web side.
///
/// Every collection is the BEARER'S OWN, through a self-scoped route (401 without a session, no
/// user parameter), and every route applies the publication gate and strips unservable media:
///
///   posts   — the public rows of `GET /api/reviews/mine`
///   liked   — `GET /api/reviews/liked`   (newest like first)
///   saved   — `GET /api/reviews/saved`   (newest save first)
///   hidden  — the `is_hidden` rows of `/mine`, drawn with the eye-off treatment
///   shared  — `GET /api/reviews/shared`  (the share history, newest first)
///
/// Saved PLACES are a separate surface (`FavoritesView`), not a sixth collection: the contract is
/// reviews, and Android's five are reviews.
enum OwnCollection: String, CaseIterable, Identifiable, Sendable {
    case posts, liked, saved, hidden, shared

    var id: String { rawValue }

    /// The chip label — the Android self profile's wording (Bài viết / Đã thích / Đã lưu /
    /// Đã ẩn / Đã share), through the catalogue.
    var titleKey: String { "collections.tab.\(rawValue)" }

    /// The empty state's line, through the catalogue.
    var emptyKey: String { "collections.empty.\(rawValue)" }

    var systemImage: String {
        switch self {
        case .posts: return "square.grid.3x3"
        case .liked: return "heart"
        case .saved: return "bookmark"
        case .hidden: return "eye.slash"
        case .shared: return "square.and.arrow.up"
        }
    }
}

/// `{ reviews: [...] }` — the shape of `GET /api/reviews/mine`.
///
/// 🚨 NOT `FeedResponse`. The feed carries `page` and `limit`; the own-collection routes carry
/// neither, and `FeedResponse` declares both non-optional — so decoding `/mine` as a
/// `FeedResponse` threw `keyNotFound(page)` on every load, and `MyPostsView` showed its error
/// state to every author (found 2026-09-17 while bringing the five collections to iOS).
struct ReviewListResponse: Decodable, Sendable {
    let reviews: [Review]
}

/// One row of `/api/reviews/liked`, `/saved` and `/shared` — the compact tile shape those routes
/// serve (`id, place_name, body, photos, thumbnail, content_type, created_at` plus the
/// collection's own timestamp). A full `Review` cannot decode it: those routes send no counts,
/// no author and no `liked_by_me`, and `Review` declares them non-optional. What a tile needs is
/// exactly what is here; the detail screen fetches the full review by id on open.
struct CollectionReview: Decodable, Sendable, Identifiable, Hashable {
    let id: String
    let placeName: String?
    let body: String?
    let photos: [String]?
    let thumbnail: String?
    let contentType: String?
    let createdAt: String
    /// `/liked` — when this account liked it.
    let likedAt: String?
    /// `/saved` — when this account saved it.
    let savedAt: String?
    /// `/shared` — this account's latest share of it (the route collapses the history).
    let sharedAt: String?

    var isVideo: Bool { contentType == "video" }
}

/// `{ reviews: [...] }` — the shape of the three compact collection routes.
struct CollectionReviewListResponse: Decodable, Sendable {
    let reviews: [CollectionReview]
}
