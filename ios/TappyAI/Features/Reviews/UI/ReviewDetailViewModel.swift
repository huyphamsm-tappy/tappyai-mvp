import Foundation

/// One review, on its own screen.
///
/// ============================================================================
/// WHY THIS FETCHES INSTEAD OF READING A CACHE
/// ============================================================================
/// Android's detail screen reads the review out of the in-memory cache the feed populated, and a
/// cache miss shows an empty state. That is fine when the user tapped through from the feed and
/// wrong in the one case a detail screen exists for: a SHARED link, opened cold, where nothing has
/// ever populated a cache.
///
/// `GET /api/reviews/{id}` now exists, so this screen resolves from the id alone. A review that is
/// hidden or held by the safety gate answers 404 there, and this shows "not available" rather than
/// a blank screen — the same thing a visitor sees on the web.
@MainActor
final class ReviewDetailViewModel: AppObservableObject {
    enum LoadState: Equatable { case loading, loaded, notFound, failed(AppError) }

    @AppPublished var state: LoadState = .loading
    @AppPublished var review: Review?

    // Comments — the same shape the feed uses, so `ReviewCommentSheet` is shared verbatim.
    @AppPublished var showComments = false
    @AppPublished var comments: [ReviewComment] = []
    @AppPublished var commentCount: Int = 0
    @AppPublished var isLoadingComments = false
    @AppPublished var commentText = ""
    @AppPublished var isPostingComment = false
    @AppPublished var commentError: String?
    @AppPublished var replyingTo: ReviewComment?
    @AppPublished var showShare = false

    let reviewId: String
    private let service: ReviewsService
    private let session: SessionStore
    private let log = AppLogger.reviews

    var isAuthenticated: Bool { session.state.isAuthenticated }
    var currentUserId: String? { session.userId }
    var isOwnPost: Bool { review?.userId != nil && review?.userId == session.userId }

    init(reviewId: String, service: ReviewsService, session: SessionStore) {
        self.reviewId = reviewId
        self.service = service
        self.session = session
    }

    // MARK: - Loading

    func load() async {
        state = .loading
        do {
            let loaded = try await service.fetchReview(id: reviewId)
            review = loaded
            commentCount = loaded.commentCount
            state = .loaded
        } catch {
            if Task.isCancelled { return }
            let appError = error as? AppError ?? .unexpected(message: error.localizedDescription)
            // 404 is not a failure to load — it is the answer. A review can be deleted, hidden by
            // its author, or held by the safety gate, and a shared link to any of those must say
            // so plainly instead of offering a Retry button that can never succeed.
            if case .network(let status, _) = appError, status == 404 {
                state = .notFound
            } else {
                state = .failed(appError)
            }
            log.error("review detail load failed: \(error)")
        }
    }

    // MARK: - Reactions

    func toggleLike() {
        guard var current = review else { return }
        let wasLiked = current.likedByMe
        let oldCount = current.likeCount
        current.likedByMe = !wasLiked
        current.likeCount = max(0, oldCount + (wasLiked ? -1 : 1))
        review = current

        Task {
            do {
                let result = try await service.toggleLike(reviewId: reviewId)
                review?.likedByMe = result.liked
            } catch {
                review?.likedByMe = wasLiked
                review?.likeCount = oldCount
                log.error("like failed: \(error)")
            }
        }
    }

    func toggleSave() {
        guard var current = review else { return }
        let wasSaved = current.savedByMe
        let oldCount = current.saveCount
        current.savedByMe = !wasSaved
        current.saveCount = max(0, oldCount + (wasSaved ? -1 : 1))
        review = current

        Task {
            do {
                let result = try await service.toggleSave(reviewId: reviewId)
                review?.savedByMe = result.saved
            } catch {
                review?.savedByMe = wasSaved
                review?.saveCount = oldCount
                log.error("save failed: \(error)")
            }
        }
    }

    // MARK: - Author and own-post actions (the same service calls the Explore feed makes, `ReviewsFeedViewModel`)

    func toggleFollow(userId: String) {
        Task {
            do { _ = try await service.toggleFollow(userId: userId) } catch { log.error("follow failed: \(error)") }
        }
    }

    /// Deletes the post; `onGone` runs once it is gone (the screen has nothing left to show).
    func deleteReview(onGone: @escaping () -> Void) {
        Task {
            do {
                try await service.deleteReview(reviewId: reviewId)
                onGone()
            } catch { log.error("delete review failed: \(error)") }
        }
    }

    func hideReview(onGone: @escaping () -> Void) {
        Task {
            do {
                try await service.hideReview(reviewId: reviewId, hidden: true)
                onGone()
            } catch { log.error("hide review failed: \(error)") }
        }
    }

    // MARK: - Comments

    func openComments() {
        showComments = true
        Task { await loadComments() }
    }

    func closeComments() {
        showComments = false
        commentError = nil
    }

    func loadComments() async {
        isLoadingComments = true
        commentError = nil
        do {
            let response = try await service.fetchComments(reviewId: reviewId)
            comments = response.comments
            commentCount = response.count
            review?.commentCount = response.count
        } catch {
            commentError = NSLocalizedString("review.comments.error.load", comment: "")
            log.error("comments load failed: \(error)")
        }
        isLoadingComments = false
    }

    func postComment() {
        let body = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, body.count <= 300 else { return }
        isPostingComment = true
        commentError = nil
        let savedText = commentText
        let parent = replyingTo
        commentText = ""

        Task {
            do {
                let response = try await service.postComment(reviewId: reviewId, body: body, parentId: parent.map(CommentActions.parentId(forReplyingTo:)))
                replyingTo = nil
                comments.append(response.comment)
                commentCount = response.count
                review?.commentCount = response.count
            } catch {
                commentText = savedText
                commentError = NSLocalizedString("review.comments.error.post", comment: "")
                log.error("post comment failed: \(error)")
            }
            isPostingComment = false
        }
    }

    /// Picks (or takes back) `reaction` on a comment: shown at once, undone if the server refuses.
    func react(to comment: ReviewComment, with reaction: CommentReaction) {
        guard let idx = comments.firstIndex(where: { $0.id == comment.id }) else { return }
        let before = comments[idx]
        comments[idx] = CommentActions.applying(reaction, to: before)
        let result = CommentActions.resulting(reaction, on: before)
        Task {
            do { try await service.setCommentReaction(commentId: comment.id, reaction: result) } catch {
                if let i = comments.firstIndex(where: { $0.id == comment.id }) { comments[i] = before }
                log.error("comment reaction failed: \(error)")
            }
        }
    }

    func deleteComment(commentId: String) {
        Task {
            do {
                let response = try await service.deleteComment(reviewId: reviewId, commentId: commentId)
                comments = CommentActions.removing(commentId, from: comments)
                commentCount = response.count
                review?.commentCount = response.count
            } catch {
                commentError = NSLocalizedString("review.comments.error.delete", comment: "")
                log.error("delete comment failed: \(error)")
            }
        }
    }
}
