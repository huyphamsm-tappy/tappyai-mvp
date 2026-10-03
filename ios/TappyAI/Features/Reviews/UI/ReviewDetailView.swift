import SwiftUI

/// A single review, on its own screen — the native counterpart of the web's `/reviews/[id]`.
///
/// ============================================================================
/// ONE VIEWER: THIS IS THE EXPLORE POST, SHOWING ONE REVIEW
/// ============================================================================
/// The Web's `/reviews/[id]` mounts the app's ONE clip viewer (`ReviewClipView.tsx` → `ClipViewer`, the same
/// component Explore, the profile grid and the Inbox use) with exactly the one review the URL names: "no second viewer,
/// no copy of the rail, no visual change". This screen does the same: it draws `ReviewPostView` — the Explore page —
/// for that one review, so a clip opened from a profile or a shared link looks and acts like it does in Explore
/// (full-bleed media, creator row, place chip, caption, like / comment / save / share rail, follow, report).
/// There is deliberately no second layout here. What stays specific to this screen is the loading, "not available"
/// and error states, and fetching the review by id (a shared link opens cold: nothing has populated a cache).
struct ReviewDetailView: View {
    @AppStateObject private var vm: ReviewDetailViewModel
    @AppStateObject private var videoPlayer = FeedVideoPlayer()
    @AppEnvironmentState private var router: AppRouter

    private let baseURL: String
    @ObservedObject private var safety: SafetyStore
    @State private var safetyTarget: SafetyTarget?

    init(deps: AppDependencies, reviewId: String) {
        _safety = ObservedObject(wrappedValue: deps.safety)
        _vm = AppStateObject(wrappedValue: ReviewDetailViewModel(
            reviewId: reviewId,
            service: ReviewsService(api: deps.api),
            session: deps.session
        ))
        self.baseURL = deps.env.apiBaseURL.absoluteString
    }

    var body: some View {
        ZStack {
            // The Explore ground: the same background token as the feed.
            TappyColor.feedBackground.ignoresSafeArea()

            switch vm.state {
            case .loading:
                VStack(spacing: Spacing.md) {
                    TappySkeleton().frame(height: 240)
                    TappySkeleton().frame(height: 20)
                    TappySkeleton().frame(height: 80)
                }
                .padding(Spacing.md)

            case .notFound:
                // Deleted, hidden by its author, or held by the safety gate. All three are "this
                // is not available", and none of them is retriable — offering a Retry button here
                // would invite the user to press it forever.
                TappyEmptyState(
                    systemImage: "eye.slash",
                    title: "reviewDetail.unavailable.title",
                    message: "reviewDetail.unavailable.message"
                )

            case .failed(let error):
                TappyErrorState(presentation: ErrorPresenter.present(error)) {
                    Task { await vm.load() }
                }

            case .loaded:
                if let review = vm.review {
                    post(review)
                }
            }
        }
        // Same chrome as Explore: the picture runs to the very top under a transparent bar that keeps only the system
        // back button, and the status bar is hidden.
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .statusBarHidden(true)
        .sheet(item: $safetyTarget) { target in
            SafetySheet(target: target, safety: safety) { safetyTarget = nil }
                .presentationDetents([.large])
        }
        .task { await vm.load() }
        .sheet(isPresented: Binding(get: { vm.showComments }, set: { if !$0 { vm.closeComments() } })) {
            ReviewCommentSheet(
                comments: vm.comments,
                count: vm.commentCount,
                isLoading: vm.isLoadingComments,
                isPosting: vm.isPostingComment,
                isAuthenticated: vm.isAuthenticated,
                currentUserId: vm.currentUserId,
                errorMessage: vm.commentError,
                safety: safety,
                text: Binding(get: { vm.commentText }, set: { vm.commentText = $0 }),
                onPost: { vm.postComment() },
                onDelete: { vm.deleteComment(commentId: $0) },
                onDismiss: { vm.closeComments() }
            )
        }
        .sheet(isPresented: Binding(get: { vm.showShare }, set: { vm.showShare = $0 })) {
            if let review = vm.review {
                ReviewShareSheet(
                    review: review,
                    baseURL: baseURL,
                    onDismiss: { vm.showShare = false }
                )
                .presentationDetents([.large])
            }
        }
    }

    /// The Explore page for this one review: the same view and the same actions the feed wires
    /// (`ReviewsFeedView`), against this screen's own state.
    private func post(_ review: Review) -> some View {
        ReviewPostView(
            review: review,
            isActive: true,
            isNeighbor: true,
            isAuthenticated: vm.isAuthenticated,
            isOwnPost: review.userId != nil && review.userId == vm.currentUserId,
            videoPlayer: videoPlayer,
            onLike: { vm.toggleLike() },
            onDoubleTapLike: { if !review.likedByMe { vm.toggleLike() } },
            onSave: { vm.toggleSave() },
            onComment: { vm.openComments() },
            onShare: { vm.showShare = true },
            onFollow: { if let uid = review.userId { vm.toggleFollow(userId: uid) } },
            onDelete: { vm.deleteReview { router.pop() } },
            onHide: { vm.hideReview { router.pop() } },
            onCreatorTap: {
                if let uid = review.userId { router.push(ReviewsDestination.userProfile(id: uid)) }
            },
            // Report / block (App Store 1.2): signed-in, not your own post, and only while a server safety flag is on.
            onSafety: safety.flags.anyEnabled ? {
                safetyTarget = SafetyTarget(kind: .review, targetId: review.id, authorId: review.userId,
                                            authorName: review.profiles?.fullName, summary: review.placeName ?? review.body)
            } : nil
        )
        .ignoresSafeArea(edges: .top)
    }
}
