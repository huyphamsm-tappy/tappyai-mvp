import Foundation
import Combine

@MainActor
final class ReviewsFeedViewModel: AppObservableObject {
    @AppPublished var reviews: [Review] = []
    @AppPublished var activeTab: FeedTab = .forYou
    @AppPublished var isLoading = false
    @AppPublished var isLoadingMore = false
    @AppPublished var error: AppError?
    @AppPublished var activeIndex: Int = 0
    @AppPublished var commentReviewId: String?
    @AppPublished var comments: [ReviewComment] = []
    @AppPublished var commentCount: Int = 0
    @AppPublished var isLoadingComments = false
    @AppPublished var commentText = ""
    @AppPublished var isPostingComment = false
    @AppPublished var commentError: String?
    @AppPublished var shareReviewId: String?
    @AppPublished var menuReviewId: String?

    let service: ReviewsService
    private let session: SessionStore
    private var page = 0
    private var hasMore = true
    private var feedTask: Task<Void, Never>?
    private let log = AppLogger.reviews

    var isAuthenticated: Bool { session.state.isAuthenticated }
    var currentUserId: String? { session.userId }

    init(service: ReviewsService, session: SessionStore) {
        self.service = service
        self.session = session
    }

    // MARK: - Feed loading

    func loadFeed() async {
        guard !isLoading else { return }
        isLoading = true
        error = nil
        page = 0
        hasMore = true

        do {
            let response = try await service.fetchFeed(
                page: 0,
                sort: feedSort,
                following: activeTab == .following
            )
            reviews = response.reviews
            hasMore = response.reviews.count >= response.limit
            page = 1
            activeIndex = 0
        } catch {
            self.error = error as? AppError ?? .unexpected(message: error.localizedDescription)
            log.error("feed load failed: \(error)")
        }
        isLoading = false
    }

    func loadMore() async {
        guard !isLoadingMore, hasMore, !isLoading else { return }
        isLoadingMore = true

        do {
            let response = try await service.fetchFeed(
                page: page,
                sort: feedSort,
                following: activeTab == .following
            )
            reviews.append(contentsOf: response.reviews)
            hasMore = response.reviews.count >= response.limit
            page += 1
        } catch {
            log.error("feed load more failed: \(error)")
        }
        isLoadingMore = false
    }

    func refresh() async {
        page = 0
        hasMore = true
        error = nil

        do {
            let response = try await service.fetchFeed(
                page: 0,
                sort: feedSort,
                following: activeTab == .following
            )
            reviews = response.reviews
            hasMore = response.reviews.count >= response.limit
            page = 1
            activeIndex = 0
        } catch {
            log.error("feed refresh failed: \(error)")
        }
    }

    func switchTab(_ tab: FeedTab) {
        guard tab != activeTab else { return }
        activeTab = tab
        reviews = []
        activeIndex = 0
        isLoading = false
        feedTask?.cancel()
        feedTask = Task { await loadFeed() }
    }

    private var feedSort: FeedSort {
        switch activeTab {
        case .forYou: return .trending
        case .following, .latest: return .latest
        }
    }

    // MARK: - Like (optimistic, matches Web double-tap + rail behavior)

    func toggleLike(reviewId: String) {
        guard let idx = reviews.firstIndex(where: { $0.id == reviewId }) else { return }
        let wasLiked = reviews[idx].likedByMe
        let oldCount = reviews[idx].likeCount
        reviews[idx].likedByMe = !wasLiked
        reviews[idx].likeCount = max(0, oldCount + (wasLiked ? -1 : 1))

        Task {
            do {
                let result = try await service.toggleLike(reviewId: reviewId)
                if let i = reviews.firstIndex(where: { $0.id == reviewId }) {
                    reviews[i].likedByMe = result.liked
                }
            } catch {
                if let i = reviews.firstIndex(where: { $0.id == reviewId }) {
                    reviews[i].likedByMe = wasLiked
                    reviews[i].likeCount = oldCount
                }
                log.error("like failed: \(error)")
            }
        }
    }

    func doubleTapLike(reviewId: String) {
        guard let idx = reviews.firstIndex(where: { $0.id == reviewId }) else { return }
        if reviews[idx].likedByMe { return }
        let oldCount = reviews[idx].likeCount
        reviews[idx].likedByMe = true
        reviews[idx].likeCount = oldCount + 1

        Task {
            do {
                let result = try await service.toggleLike(reviewId: reviewId)
                if let i = reviews.firstIndex(where: { $0.id == reviewId }) {
                    reviews[i].likedByMe = result.liked
                }
            } catch {
                if let i = reviews.firstIndex(where: { $0.id == reviewId }) {
                    reviews[i].likedByMe = false
                    reviews[i].likeCount = oldCount
                }
            }
        }
    }

    // MARK: - Save (optimistic)

    func toggleSave(reviewId: String) {
        guard let idx = reviews.firstIndex(where: { $0.id == reviewId }) else { return }
        let wasSaved = reviews[idx].savedByMe
        let oldCount = reviews[idx].saveCount
        reviews[idx].savedByMe = !wasSaved
        reviews[idx].saveCount = max(0, oldCount + (wasSaved ? -1 : 1))

        Task {
            do {
                let result = try await service.toggleSave(reviewId: reviewId)
                if let i = reviews.firstIndex(where: { $0.id == reviewId }) {
                    reviews[i].savedByMe = result.saved
                }
            } catch {
                if let i = reviews.firstIndex(where: { $0.id == reviewId }) {
                    reviews[i].savedByMe = wasSaved
                    reviews[i].saveCount = oldCount
                }
                log.error("save failed: \(error)")
            }
        }
    }

    // MARK: - Comments

    func openComments(reviewId: String) {
        commentReviewId = reviewId
        comments = []
        commentCount = 0
        commentText = ""
        commentError = nil
        Task { await loadComments(reviewId: reviewId) }
    }

    func closeComments() {
        commentReviewId = nil
    }

    func loadComments(reviewId: String) async {
        isLoadingComments = true
        commentError = nil
        do {
            let response = try await service.fetchComments(reviewId: reviewId)
            comments = response.comments
            commentCount = response.count
        } catch {
            commentError = "Không thể tải bình luận"
            log.error("comments load failed: \(error)")
        }
        isLoadingComments = false
    }

    func postComment() {
        guard let reviewId = commentReviewId else { return }
        let body = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, body.count <= 300 else { return }
        isPostingComment = true
        commentError = nil
        let savedText = commentText
        commentText = ""

        Task {
            do {
                let response = try await service.postComment(reviewId: reviewId, body: body)
                comments.append(response.comment)
                commentCount = response.count
                if let idx = reviews.firstIndex(where: { $0.id == reviewId }) {
                    reviews[idx].commentCount = response.count
                }
            } catch {
                commentText = savedText
                commentError = "Không thể đăng bình luận"
                log.error("post comment failed: \(error)")
            }
            isPostingComment = false
        }
    }

    func deleteComment(commentId: String) {
        guard let reviewId = commentReviewId else { return }
        Task {
            do {
                let response = try await service.deleteComment(reviewId: reviewId, commentId: commentId)
                comments.removeAll { $0.id == commentId }
                commentCount = response.count
                if let idx = reviews.firstIndex(where: { $0.id == reviewId }) {
                    reviews[idx].commentCount = response.count
                }
            } catch {
                log.error("delete comment failed: \(error)")
            }
        }
    }

    // MARK: - Follow

    func toggleFollow(userId: String) {
        Task {
            do {
                _ = try await service.toggleFollow(userId: userId)
            } catch {
                log.error("follow failed: \(error)")
            }
        }
    }

    // MARK: - Share

    func openShare(reviewId: String) {
        shareReviewId = reviewId
    }

    func closeShare() {
        shareReviewId = nil
    }

    // MARK: - Delete / Hide (own-post menu)

    func deleteReview(reviewId: String) {
        Task {
            do {
                try await service.deleteReview(reviewId: reviewId)
                reviews.removeAll { $0.id == reviewId }
                if activeIndex >= reviews.count { activeIndex = max(0, reviews.count - 1) }
            } catch {
                log.error("delete review failed: \(error)")
            }
        }
    }

    func hideReview(reviewId: String) {
        Task {
            do {
                try await service.hideReview(reviewId: reviewId, hidden: true)
                reviews.removeAll { $0.id == reviewId }
                if activeIndex >= reviews.count { activeIndex = max(0, reviews.count - 1) }
            } catch {
                log.error("hide review failed: \(error)")
            }
        }
    }

    // MARK: - Interact (watch-time signal)

    func interact(reviewId: String, watchSeconds: Int, completionRate: Double) async {
        await service.interact(reviewId: reviewId, watchSeconds: watchSeconds, completionRate: completionRate)
    }

    // MARK: - Infinite scroll check

    func checkLoadMore(currentIndex: Int) {
        let threshold = reviews.count - 3
        if currentIndex >= threshold {
            Task { await loadMore() }
        }
    }
}
