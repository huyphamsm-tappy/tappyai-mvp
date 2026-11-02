import SwiftUI

struct ReviewsFeedView: View {
    @AppStateObject private var vm: ReviewsFeedViewModel
    @AppEnvironmentState private var router: AppRouter

    private let deps: AppDependencies
    /// Set when this is a profile's clip viewer: that list, opened at one clip, instead of the network feed.
    private let seed: ClipSeed?
    @Environment(\.scenePhase) private var scenePhase
    @State private var videoPlayers: [String: FeedVideoPlayer] = [:]
    @State private var showCreateReview = false
    @State private var soundPageTrackId: String?
    @ObservedObject private var safety: SafetyStore
    @State private var safetyTarget: SafetyTarget?

    init(deps: AppDependencies, seed: ClipSeed? = nil) {
        self.deps = deps
        self.seed = seed
        _safety = ObservedObject(wrappedValue: deps.safety)
        let service = ReviewsService(api: deps.api)
        let model = ReviewsFeedViewModel(service: service, session: deps.session)
        if let seed { model.seed(seed.posts, start: seed.start) }
        _vm = AppStateObject(wrappedValue: model)
    }

    var body: some View {
        ZStack {
            TappyColor.feedBackground.ignoresSafeArea()

            if vm.isLoading && vm.reviews.isEmpty {
                VStack {
                    Spacer()
                    TappyLoadingIndicator()
                    Spacer()
                }
            } else if let error = vm.error, vm.reviews.isEmpty {
                errorView(error)
            } else if vm.reviews.isEmpty && !vm.isLoading {
                emptyView
            } else if !vm.reviews.isEmpty {
                // The picture runs to the very top: the status bar is hidden here, so a safe-area inset would only
                // leave a black band above the clip (seen at the top of the App Store picture).
                feedContent.ignoresSafeArea(edges: .top)
            }

            if seed == nil {
                feedTabs
                createButton
            } else {
                backButton
            }
        }
        .statusBarHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .sheet(item: commentBinding) { _ in
            ReviewCommentSheet(
                comments: vm.comments,
                count: vm.commentCount,
                isLoading: vm.isLoadingComments,
                isPosting: vm.isPostingComment,
                isAuthenticated: vm.isAuthenticated,
                currentUserId: vm.currentUserId,
                errorMessage: vm.commentError,
                safety: safety,
                text: $vm.commentText,
                onPost: { vm.postComment() },
                onDelete: { vm.deleteComment(commentId: $0) },
                replyingTo: vm.replyingTo,
                onReply: { vm.replyingTo = $0 },
                onReact: { vm.react(to: $0, with: $1) },
                onDismiss: { vm.closeComments() }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(item: shareBinding) { wrapper in
            if let review = vm.reviews.first(where: { $0.id == wrapper.id }) {
                ReviewShareSheet(
                    review: review,
                    baseURL: deps.env.apiBaseURL.absoluteString,
                    onDismiss: { vm.closeShare() }
                )
                .presentationDetents([.large])
            }
        }
        .fullScreenCover(isPresented: $showCreateReview) {
            CreateReviewView(deps: deps)
        }
        .sheet(item: $safetyTarget) { target in
            SafetySheet(target: target, safety: safety) { safetyTarget = nil }
                .presentationDetents([.large])
        }
        .onChange(of: safety.blockedIds) { vm.dropAuthors($0) }
        .onChange(of: safety.reportedReviewIds) { vm.dropReviews($0) }
        .sheet(item: soundPageBinding) { wrapper in
            NavigationStack {
                SoundPageView(trackId: wrapper.id, deps: deps)
            }
        }
        .alert(NSLocalizedString(vm.reportOutcome?.messageKey ?? "review.report.thanks", comment: ""),
               isPresented: Binding(get: { vm.reportOutcome != nil }, set: { if !$0 { vm.reportOutcome = nil } })) {
            Button(NSLocalizedString("common.ok", comment: "")) { vm.reportOutcome = nil }
        }
        .task {
            if seed == nil { await vm.loadFeed() }
            vm.dropAuthors(safety.blockedIds)
        }
        // Explore (or the viewer) is leaving the screen — another tab, a pushed screen, a full-screen cover, the lock screen: no clip
        // may go on playing. Coming back re-activates the clip that is on screen (its page's `onAppear`).
        .onDisappear { FeedVideoPlayer.pauseAll() }
        .onChange(of: scenePhase) { if $0 != .active { FeedVideoPlayer.pauseAll() } }
        .onChange(of: vm.reviews.map(\.id)) { newIDs in
            let active = Set(newIDs)
            for key in videoPlayers.keys where !active.contains(key) {
                videoPlayers.removeValue(forKey: key)
            }
        }
    }

    // MARK: - Sheet bindings

    private var commentBinding: Binding<StringIdentifiable?> {
        Binding<StringIdentifiable?>(
            get: { vm.commentReviewId.map { StringIdentifiable(id: $0) } },
            set: { vm.commentReviewId = $0?.id }
        )
    }

    private var shareBinding: Binding<StringIdentifiable?> {
        Binding<StringIdentifiable?>(
            get: { vm.shareReviewId.map { StringIdentifiable(id: $0) } },
            set: { vm.shareReviewId = $0?.id }
        )
    }

    /// The sound page. Refused while Music is hidden (`ProductFlags.showMusic`): the disc that
    /// sets `soundPageTrackId` is already gone from the action rail, and the sheet is refused here
    /// too so no restored state can present it.
    private var soundPageBinding: Binding<StringIdentifiable?> {
        Binding<StringIdentifiable?>(
            get: { ProductFlags.showMusic ? soundPageTrackId.map { StringIdentifiable(id: $0) } : nil },
            set: { soundPageTrackId = $0?.id }
        )
    }

    private var backButton: some View {
        VStack {
            HStack {
                Button { router.pop() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 38, height: 38).background(.black.opacity(0.4)).clipShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("review-back")
                Spacer()
            }
            .padding(.top, Spacing.xxl - 4).padding(.leading, Spacing.md)
            Spacer()
        }
    }

    // MARK: - Create button (matches Web TikTok-style "+" center nav button)

    private var createButton: some View {
        // Top-right, level with the feed tabs: the old bottom-centre button sat on top of the post's caption.
        VStack {
            HStack {
                Spacer()
                Button { showCreateReview = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(TappyColor.primary)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("feed-create")
                .accessibilityLabel(Text("feed.create.a11y"))
            }
            .padding(.top, Spacing.xxl - 4)
            .padding(.trailing, Spacing.md)
            Spacer()
        }
    }

    // MARK: - Feed tabs

    private var feedTabs: some View {
        VStack {
            HStack(spacing: Spacing.lg) {
                tabButton(NSLocalizedString("feed.tab.following", comment: ""), tab: .following)
                tabButton(NSLocalizedString("feed.tab.forYou", comment: ""), tab: .forYou)
                tabButton(NSLocalizedString("feed.tab.latest", comment: ""), tab: .latest)
            }
            .padding(.top, Spacing.xxl)

            Spacer()
        }
    }

    private func tabButton(_ title: String, tab: FeedTab) -> some View {
        Button {
            vm.switchTab(tab)
        } label: {
            VStack(spacing: Spacing.xxs) {
                Text(title)
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(
                        vm.activeTab == tab
                            ? TappyColor.feedTextPrimary
                            : TappyColor.feedTextSecondary
                    )

                RoundedRectangle(cornerRadius: 1)
                    .fill(vm.activeTab == tab ? TappyColor.feedTextPrimary : Color.clear)
                    .frame(width: 30, height: 2)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Feed (UIPageViewController-backed vertical paging)

    private var feedContent: some View {
        VerticalPagingView(
            pageCount: vm.reviews.count,
            currentPage: $vm.activeIndex,
            onPageChange: { index in
                vm.checkLoadMore(currentIndex: index)
            },
            onNearEnd: {
                Task { await vm.loadMore() }
            }
        ) { index in
            let review = vm.reviews[index]
            ReviewPostView(
                review: review,
                isActive: index == vm.activeIndex,
                isNeighbor: abs(index - vm.activeIndex) <= 1,
                isAuthenticated: vm.isAuthenticated,
                isOwnPost: review.userId == vm.currentUserId,
                videoPlayer: playerFor(review),
                onLike: { vm.toggleLike(reviewId: review.id) },
                onDoubleTapLike: { vm.doubleTapLike(reviewId: review.id) },
                onSave: { vm.toggleSave(reviewId: review.id) },
                onComment: { vm.openComments(reviewId: review.id) },
                onShare: { vm.openShare(reviewId: review.id) },
                onFollow: {
                    if let uid = review.userId { vm.toggleFollow(userId: uid) }
                },
                onDelete: { vm.deleteReview(reviewId: review.id) },
                onHide: { vm.hideReview(reviewId: review.id) },
                // Was `{}` — the avatar and name in the feed were tappable and did nothing,
                // because there was no profile screen to open. There is one now.
                onCreatorTap: {
                    if let uid = review.userId {
                        router.push(ReviewsDestination.userProfile(id: uid), on: .explore)
                    }
                },
                onMusicTap: review.music?.trackId != nil ? {
                    soundPageTrackId = review.music?.trackId
                } : nil,
                onReport: { vm.reportReview(reviewId: review.id, reason: $0) },
                onSafety: safety.flags.anyEnabled ? {
                    safetyTarget = SafetyTarget(kind: .review, targetId: review.id, authorId: review.userId,
                                                authorName: review.profiles?.fullName,
                                                summary: review.placeName ?? review.body)
                } : nil
            )
        }
        .ignoresSafeArea()
    }

    // MARK: - Empty / Error states

    @ViewBuilder
    private var emptyView: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "play.rectangle")
                .font(.system(size: 48))
                .foregroundStyle(TappyColor.feedTextSecondary)

            switch vm.activeTab {
            case .following:
                Text(NSLocalizedString("feed.following.emptyTitle", comment: ""))
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.feedTextPrimary)
                Text(NSLocalizedString("feed.following.emptyBody", comment: ""))
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.feedTextSecondary)
                    .multilineTextAlignment(.center)
                Button(NSLocalizedString("feed.seeSuggestions", comment: "")) {
                    vm.switchTab(.forYou)
                }
                .buttonStyle(.tappy(.primary))

            case .forYou:
                Text(NSLocalizedString("feed.empty", comment: ""))
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.feedTextPrimary)
                Text(NSLocalizedString("feed.empty.createFirst", comment: ""))
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.feedTextSecondary)
                    .multilineTextAlignment(.center)

            case .latest:
                Text(NSLocalizedString("feed.empty", comment: ""))
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.feedTextPrimary)
                Text(NSLocalizedString("feed.latest.empty", comment: ""))
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.feedTextSecondary)
                    .multilineTextAlignment(.center)
                Button(NSLocalizedString("feed.seeSuggestions", comment: "")) {
                    vm.switchTab(.forYou)
                }
                .buttonStyle(.tappy(.primary))
            }
        }
        .padding(Spacing.lg)
    }

    @ViewBuilder
    private func errorView(_ error: AppError) -> some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundStyle(TappyColor.danger)
            Text(NSLocalizedString("feed.loadFailed", comment: ""))
                .font(TappyFont.headline)
                .foregroundStyle(TappyColor.feedTextPrimary)
            Text(NSLocalizedString("feed.tryAgainLater", comment: ""))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.feedTextSecondary)
            Button(NSLocalizedString("common.retry", comment: "")) {
                Task { await vm.loadFeed() }
            }
            .buttonStyle(.tappy(.primary))
        }
        .padding(Spacing.lg)
    }

    // MARK: - Video player pool

    private func playerFor(_ review: Review) -> FeedVideoPlayer {
        if let existing = videoPlayers[review.id] { return existing }
        let player = FeedVideoPlayer()
        let reviewId = review.id
        let service = vm.service
        player.onInteract = { watchSeconds, completionRate in
            Task { await service.interact(reviewId: reviewId, watchSeconds: watchSeconds, completionRate: completionRate) }
        }
        videoPlayers[review.id] = player
        return player
    }
}

// MARK: - Identifiable wrapper for sheet bindings

struct StringIdentifiable: Identifiable {
    let id: String
}

/// A fixed list of posts and the one to open first (the profile's clip viewer).
struct ClipSeed {
    let posts: [Review]
    let start: Int
}
