import Foundation

/// Someone else's public profile — header plus their public posts.
///
/// 🚨 The posts come from `/api/reviews/feed?userId=`, NOT `/api/reviews/mine`, even when the id
/// happens to be the viewer's own. That feed excludes hidden and unpublished rows for every
/// viewer including the author, which is exactly what makes it the PUBLIC grid: what is shown here
/// is what a stranger would see. The author's own complete list, with the safety-gate reasons, is
/// `MyPostsView` and is reached from their own profile tab.
@MainActor
final class UserProfileViewModel: AppObservableObject {
    enum LoadState: Equatable { case loading, loaded, notFound, failed(AppError) }

    @AppPublished var state: LoadState = .loading
    @AppPublished var profile: PublicUserProfile?
    @AppPublished var reviews: [Review] = []
    @AppPublished var isLoadingMore = false
    @AppPublished var isTogglingFollow = false

    let userId: String
    private let service: ReviewsService
    private let session: SessionStore
    private let log = AppLogger.reviews
    private var page = 0
    private var hasMore = true

    var isAuthenticated: Bool { session.state.isAuthenticated }
    /// Whether this is the viewer's own profile. Trusts the SERVER's answer first — it resolved
    /// the caller from a verified token — and falls back to the local session id only when the
    /// field is absent.
    var isSelf: Bool { profile?.isSelf ?? (session.userId == userId) }

    init(userId: String, service: ReviewsService, session: SessionStore) {
        self.userId = userId
        self.service = service
        self.session = session
    }

    func load() async {
        state = .loading
        page = 0
        hasMore = true
        do {
            // The header and the first page are independent reads; fetching them together means
            // the screen paints once rather than twice.
            async let profileTask = service.fetchUserProfile(userId: userId)
            async let feedTask = service.fetchUserReviews(userId: userId, page: 0)
            let (loadedProfile, feed) = try await (profileTask, feedTask)
            profile = loadedProfile
            reviews = feed.reviews
            hasMore = feed.reviews.count >= feed.limit
            page = 1
            state = .loaded
        } catch {
            if Task.isCancelled { return }
            let appError = error as? AppError ?? .unexpected(message: error.localizedDescription)
            if case .network(let status, _) = appError, status == 404 {
                state = .notFound
            } else {
                state = .failed(appError)
            }
            log.error("user profile load failed: \(error)")
        }
    }

    func loadMore() async {
        guard hasMore, !isLoadingMore, state == .loaded else { return }
        isLoadingMore = true
        do {
            let feed = try await service.fetchUserReviews(userId: userId, page: page)
            reviews.append(contentsOf: feed.reviews)
            hasMore = feed.reviews.count >= feed.limit
            page += 1
        } catch {
            log.error("user profile page \(self.page) failed: \(error)")
        }
        isLoadingMore = false
    }

    /// Optimistic follow toggle, reconciled with the server's own count.
    ///
    /// The button is disabled while a toggle is in flight: a double tap would otherwise send two
    /// toggles and land on the state it started in, with a follower count that no longer matches.
    func toggleFollow() {
        guard isAuthenticated, !isSelf, !isTogglingFollow else { return }
        guard var current = profile else { return }
        let wasFollowing = current.isFollowing ?? false
        let oldCount = current.followerCount ?? 0
        current.isFollowing = !wasFollowing
        current.followerCount = max(0, oldCount + (wasFollowing ? -1 : 1))
        profile = current
        isTogglingFollow = true

        Task {
            do {
                let result = try await service.toggleFollow(userId: userId)
                profile?.isFollowing = result.following
                profile?.followerCount = result.followerCount
            } catch {
                profile?.isFollowing = wasFollowing
                profile?.followerCount = oldCount
                log.error("follow toggle failed: \(error)")
            }
            isTogglingFollow = false
        }
    }
}
