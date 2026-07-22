import SwiftUI

struct ReviewsFeedView: View {
    @AppStateObject private var vm: ReviewsFeedViewModel

    private let deps: AppDependencies
    @State private var videoPlayers: [String: FeedVideoPlayer] = [:]
    @State private var showCreateReview = false
    @State private var soundPageTrackId: String?

    init(deps: AppDependencies) {
        self.deps = deps
        let service = ReviewsService(api: deps.api)
        _vm = AppStateObject(wrappedValue: ReviewsFeedViewModel(
            service: service, session: deps.session
        ))
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
                feedContent
            }

            feedTabs
            createButton
        }
        .statusBarHidden(true)
        .sheet(item: commentBinding) { _ in
            ReviewCommentSheet(
                comments: vm.comments,
                count: vm.commentCount,
                isLoading: vm.isLoadingComments,
                isPosting: vm.isPostingComment,
                isAuthenticated: vm.isAuthenticated,
                currentUserId: vm.currentUserId,
                errorMessage: vm.commentError,
                text: $vm.commentText,
                onPost: { vm.postComment() },
                onDelete: { vm.deleteComment(commentId: $0) },
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
                .presentationDetents([.medium])
            }
        }
        .fullScreenCover(isPresented: $showCreateReview) {
            CreateReviewView(deps: deps)
        }
        .sheet(item: soundPageBinding) { wrapper in
            NavigationStack {
                SoundPageView(trackId: wrapper.id, deps: deps)
            }
        }
        .task {
            await vm.loadFeed()
        }
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

    private var soundPageBinding: Binding<StringIdentifiable?> {
        Binding<StringIdentifiable?>(
            get: { soundPageTrackId.map { StringIdentifiable(id: $0) } },
            set: { soundPageTrackId = $0?.id }
        )
    }

    // MARK: - Create button (matches Web TikTok-style "+" center nav button)

    private var createButton: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                Button { showCreateReview = true } label: {
                    ZStack {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(red: 105/255, green: 201/255, blue: 208/255))
                            .frame(width: 42, height: 28)
                            .offset(x: -4)
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(red: 254/255, green: 44/255, blue: 85/255))
                            .frame(width: 42, height: 28)
                            .offset(x: 4)
                        RoundedRectangle(cornerRadius: 8)
                            .fill(.white)
                            .frame(width: 42, height: 28)
                        Image(systemName: "plus")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(.black)
                    }
                    .frame(width: 50, height: 32)
                }
                .buttonStyle(.plain)
                Spacer()
            }
            .padding(.bottom, Spacing.lg)
        }
    }

    // MARK: - Feed tabs

    private var feedTabs: some View {
        VStack {
            HStack(spacing: Spacing.lg) {
                tabButton("Theo dõi", tab: .following)
                tabButton("Cho bạn", tab: .forYou)
                tabButton("Mới nhất", tab: .latest)
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
                onCreatorTap: {},
                onMusicTap: review.music?.trackId != nil ? {
                    soundPageTrackId = review.music?.trackId
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
                Text("Chưa theo dõi ai")
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.feedTextPrimary)
                Text("Theo dõi người dùng khác để xem bài review của họ ở đây")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.feedTextSecondary)
                    .multilineTextAlignment(.center)
                Button("Xem Đề xuất") {
                    vm.switchTab(.forYou)
                }
                .buttonStyle(.tappy(.primary))

            case .forYou:
                Text("Chưa có bài nào")
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.feedTextPrimary)
                Text("Hãy tạo bài review đầu tiên!")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.feedTextSecondary)
                    .multilineTextAlignment(.center)

            case .latest:
                Text("Chưa có bài nào")
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.feedTextPrimary)
                Text("Chưa có bài review mới nhất")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.feedTextSecondary)
                    .multilineTextAlignment(.center)
                Button("Xem Đề xuất") {
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
            Text("Không thể tải feed")
                .font(TappyFont.headline)
                .foregroundStyle(TappyColor.feedTextPrimary)
            Text("Vui lòng thử lại sau")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.feedTextSecondary)
            Button("Thử lại") {
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
