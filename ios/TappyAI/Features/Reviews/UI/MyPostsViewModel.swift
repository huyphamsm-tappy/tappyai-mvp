import Foundation

/// The signed-in user's own profile content — the five personal collections (`OwnCollection`:
/// posts / liked / saved / hidden / shared), the iOS counterpart of Android's self profile
/// (`SelfProfileViewModel`) and the web's `/profile` hub.
///
/// ============================================================================
/// WHY THIS SCREEN EXISTS AT ALL
/// ============================================================================
/// It is not a convenience listing. It is the surface the Explore safety contract requires: when
/// the gate does not publish a post, that post stays in its author's profile and the author is
/// told why. The composer says it once, at upload time, and is gone the moment it is dismissed —
/// so without this screen an author who closed that notice has no way left to find out why their
/// video never appeared. Web and Android both have it; iOS did not.
///
/// ============================================================================
/// THE COLLECTIONS ARE PRIVATE, AND THE GATE IS THE SESSION STATE
/// ============================================================================
/// 🚨 `isAuthenticated`, NOT "has a token". An anonymous session carries a real bearer token
/// (the chat quota runs on it), so a token check would let a guest ask for collections it cannot
/// have — and get 401s, or worse, an empty hub that looks like theirs. The rule is the one Android
/// applies (`selfProfileAccess`: signed in AND not anonymous): while the session is not
/// authenticated, NOTHING is requested and everything held is dropped. `clear()` runs on sign-out
/// for the same reason — the next account must not see the previous one's lists.
///
/// Each collection loads once, on first visit, and is kept; switching chips is free after that.
/// Posts and Hidden are the two halves of one `/mine` payload, split on `isHidden`.
@MainActor
final class MyPostsViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, loading, loaded, failed }

    /// The `/mine` payload — every post, hidden and held included. `postsState` covers it.
    @AppPublished var posts: [Review] = []
    @AppPublished var postsState: LoadState = .idle
    @AppPublished var liked: [CollectionReview] = []
    @AppPublished var likedState: LoadState = .idle
    @AppPublished var saved: [CollectionReview] = []
    @AppPublished var savedState: LoadState = .idle
    @AppPublished var shared: [CollectionReview] = []
    @AppPublished var sharedState: LoadState = .idle
    /// Non-nil while a destructive action is being confirmed.
    @AppPublished var pendingDelete: Review?

    private let service: ReviewsService
    private let session: SessionStore
    private let log = AppLogger.app

    init(service: ReviewsService, session: SessionStore) {
        self.service = service
        self.session = session
    }

    /// The gate — see the header. Read live, never cached, so a sign-out mid-screen is seen.
    var isAuthenticated: Bool { session.state.isAuthenticated }

    // MARK: - Derived collections

    /// `posts` minus the hidden ones — what Android's "Bài viết" tab lists. Held posts stay: they
    /// are the author's, not yet public, and the notice above the grid says why.
    var publicPosts: [Review] { posts.filter { $0.isHidden != true } }

    /// The `is_hidden` rows of `/mine` — the "Đã ẩn" collection.
    var hiddenPosts: [Review] { posts.filter { $0.isHidden == true } }

    /// Posts the safety gate did not publish, newest first as the server returned them.
    ///
    /// Read straight off `moderation`, never inferred from anything else on the row: the server
    /// owns this decision and the client must not compute a second opinion about it.
    var heldPosts: [Review] { posts.filter { $0.moderation?.state.isPublished == false } }

    func state(of collection: OwnCollection) -> LoadState {
        switch collection {
        case .posts, .hidden: return postsState
        case .liked: return likedState
        case .saved: return savedState
        case .shared: return sharedState
        }
    }

    // MARK: - Loading

    /// Load one collection if it is not loaded yet (or failed). A guest loads nothing.
    func load(_ collection: OwnCollection) async {
        guard isAuthenticated else { clear(); return }
        switch collection {
        case .posts, .hidden:
            guard postsState != .loaded else { return }
            await loadPosts()
        case .liked:
            guard likedState != .loaded else { return }
            likedState = .loading
            do { liked = try await service.fetchLikedReviews().reviews; likedState = .loaded }
            catch { likedState = Task.isCancelled ? .idle : .failed; log.error("liked load failed: \(error)") }
        case .saved:
            guard savedState != .loaded else { return }
            savedState = .loading
            do { saved = try await service.fetchSavedReviews().reviews; savedState = .loaded }
            catch { savedState = Task.isCancelled ? .idle : .failed; log.error("saved load failed: \(error)") }
        case .shared:
            guard sharedState != .loaded else { return }
            sharedState = .loading
            do { shared = try await service.fetchSharedReviews().reviews; sharedState = .loaded }
            catch { sharedState = Task.isCancelled ? .idle : .failed; log.error("shared load failed: \(error)") }
        }
    }

    /// Re-read one collection from the server (pull to refresh, a retry).
    func reload(_ collection: OwnCollection) async {
        switch collection {
        case .posts, .hidden: postsState = .idle
        case .liked: likedState = .idle
        case .saved: savedState = .idle
        case .shared: sharedState = .idle
        }
        await load(collection)
    }

    /// Kept for the existing callers: the author's own posts, `/mine`.
    func load() async { await reload(.posts) }

    private func loadPosts() async {
        postsState = .loading
        do {
            posts = try await service.fetchMyReviews().reviews
            postsState = .loaded
        } catch {
            // A cancelled task is not a failure — it is a screen the user left.
            postsState = Task.isCancelled ? .idle : .failed
            log.error("my posts load failed: \(error)")
        }
    }

    /// Drop everything held. Sign-out cleanup, and what a guest is left with.
    func clear() {
        posts = []; postsState = .idle
        liked = []; likedState = .idle
        saved = []; savedState = .idle
        shared = []; sharedState = .idle
        pendingDelete = nil
    }

    // MARK: - Own-post actions

    /// Hide or show one of the author's own posts. The row moves between Posts and Hidden in
    /// place — the same `/mine` payload, re-read so the server's row is what is shown.
    func toggleHidden(_ post: Review) async {
        let next = !(post.isHidden ?? false)
        do {
            try await service.hideReview(reviewId: post.id, hidden: next)
            await reload(.posts)
        } catch {
            log.error("hide toggle failed: \(error)")
        }
    }

    func delete(_ post: Review) async {
        do {
            try await service.deleteReview(reviewId: post.id)
            posts.removeAll { $0.id == post.id }
            if posts.isEmpty { postsState = .loaded }
        } catch {
            log.error("delete failed: \(error)")
        }
        pendingDelete = nil
    }
}
