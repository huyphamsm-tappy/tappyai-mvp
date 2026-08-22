import Foundation

/// The author's own posts — the iOS counterpart of the web's `/profile/posts` and Android's
/// My Reviews grid.
///
/// ============================================================================
/// WHY THIS SCREEN EXISTS AT ALL
/// ============================================================================
/// It is not a convenience listing. It is the surface the Explore safety contract requires: when
/// the gate does not publish a post, that post stays in its author's profile and the author is
/// told why. The composer says it once, at upload time, and is gone the moment it is dismissed —
/// so without this screen an author who closed that notice has no way left to find out why their
/// video never appeared. Web and Android both have it; iOS did not.
@MainActor
final class MyPostsViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, loading, loaded, failed }

    @AppPublished var state: LoadState = .idle
    @AppPublished var posts: [Review] = []
    /// Non-nil while a destructive action is being confirmed.
    @AppPublished var pendingDelete: Review?

    private let service: ReviewsService
    private let log = AppLogger.app

    init(service: ReviewsService) {
        self.service = service
    }

    func load() async {
        state = .loading
        do {
            posts = try await service.fetchMyReviews().reviews
            state = .loaded
        } catch {
            // A cancelled task is not a failure — it is a screen the user left.
            state = Task.isCancelled ? .idle : .failed
            log.error("my posts load failed: \(error)")
        }
    }

    /// Posts the safety gate did not publish, newest first as the server returned them.
    ///
    /// Read straight off `moderation`, never inferred from anything else on the row: the server
    /// owns this decision and the client must not compute a second opinion about it.
    var heldPosts: [Review] { posts.filter { $0.moderation?.state.isPublished == false } }

    func toggleHidden(_ post: Review) async {
        let next = !(post.isHidden ?? false)
        do {
            try await service.hideReview(reviewId: post.id, hidden: next)
            await load()
        } catch {
            log.error("hide toggle failed: \(error)")
        }
    }

    func delete(_ post: Review) async {
        do {
            try await service.deleteReview(reviewId: post.id)
            posts.removeAll { $0.id == post.id }
            if posts.isEmpty { state = .loaded }
        } catch {
            log.error("delete failed: \(error)")
        }
        pendingDelete = nil
    }
}
