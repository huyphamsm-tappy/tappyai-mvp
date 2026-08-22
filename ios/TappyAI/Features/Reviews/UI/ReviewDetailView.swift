import SwiftUI

/// A single review, on its own screen — the native counterpart of the web's `/reviews/[id]`.
///
/// The layout follows the web's rather than the feed's, deliberately. The feed post is a
/// full-bleed, swipe-through surface built for browsing; this is where a SHARED LINK lands, and
/// someone arriving from a link needs to read the review — the place, the rating, the text, the
/// comments — not to be dropped into a video that fills the screen. So: media hero, then the
/// content scrolls underneath it.
struct ReviewDetailView: View {
    @AppStateObject private var vm: ReviewDetailViewModel
    @AppStateObject private var videoPlayer = FeedVideoPlayer()
    @AppEnvironmentState private var router: AppRouter

    private let baseURL: String

    init(deps: AppDependencies, reviewId: String) {
        _vm = AppStateObject(wrappedValue: ReviewDetailViewModel(
            reviewId: reviewId,
            service: ReviewsService(api: deps.api),
            session: deps.session
        ))
        self.baseURL = deps.env.apiBaseURL.absoluteString
    }

    var body: some View {
        Group {
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
                    content(review)
                }
            }
        }
        .navigationTitle(Text("reviewDetail.title"))
        .navigationBarTitleDisplayMode(.inline)
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
                .presentationDetents([.medium])
            }
        }
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ review: Review) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                mediaHero(review)

                VStack(alignment: .leading, spacing: Spacing.sm) {
                    chips(review)
                    placeHeader(review)
                    authorRow(review)
                    Divider().overlay(TappyColor.separator)
                    bodyText(review)
                    hashtags(review)
                    actions(review)
                }
                .padding(.horizontal, Spacing.md)
                .padding(.bottom, Spacing.xl)
            }
        }
    }

    @ViewBuilder
    private func mediaHero(_ review: Review) -> some View {
        let height: CGFloat = 280
        ZStack {
            TappyColor.feedBackground
            if review.isVideo, !isExternalEmbed(review), let raw = review.mediaUrl, let url = URL(string: raw) {
                FeedVideoView(player: videoPlayer.player)
                    .onAppear {
                        videoPlayer.load(url: url)
                        videoPlayer.setActive(true)
                    }
                    .onDisappear { videoPlayer.setActive(false) }
            } else if review.sourceType == "youtube", let videoId = youTubeId(review.sourceUrl) {
                YouTubeEmbedView(videoId: videoId)
            } else if let photos = review.photos, !photos.isEmpty {
                ReviewPhotoCarousel(photos: photos)
            } else if let thumb = review.thumbnail, let url = URL(string: thumb) {
                AsyncImage(url: url) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    TappyColor.feedBackground
                }
            } else {
                Image(systemName: "photo")
                    .font(.system(size: 40))
                    .foregroundStyle(TappyColor.feedTextSecondary)
            }
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .clipped()
    }

    @ViewBuilder
    private func chips(_ review: Review) -> some View {
        HStack(spacing: Spacing.xs) {
            if let rating = review.rating, rating > 0 {
                Text(verbatim: "★ \(String(format: "%.1f", rating))")
                    .font(TappyFont.caption)
                    .padding(.horizontal, Spacing.xs)
                    .padding(.vertical, Spacing.xxs)
                    .background(TappyColor.surface)
                    .clipShape(Capsule())
            }
            Spacer()
        }
    }

    @ViewBuilder
    private func placeHeader(_ review: Review) -> some View {
        if !review.isShareOnly, let name = review.placeName {
            Text(verbatim: name)
                .font(TappyFont.title)
                .foregroundStyle(TappyColor.textPrimary)
        }
        if let address = review.placeAddress, !address.isEmpty {
            HStack(spacing: Spacing.xxs) {
                Image(systemName: "mappin.and.ellipse")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                Text(verbatim: address)
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
    }

    @ViewBuilder
    private func authorRow(_ review: Review) -> some View {
        // The author is a LINK, exactly as on the web — tapping the name opens their profile.
        // A detail screen where the author is inert is a dead end for anyone who arrived from a
        // shared link and wants to see who wrote it.
        Button {
            guard let userId = review.userId else { return }
            router.push(ReviewsDestination.userProfile(id: userId))
        } label: {
            HStack(spacing: Spacing.xs) {
                avatar(review.profiles?.avatarUrl, initial: review.displayName)
                Text(verbatim: review.displayName)
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)
                Image(systemName: "chevron.right")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
        .buttonStyle(.plain)
        .disabled(review.userId == nil)
        .accessibilityLabel(Text("reviewDetail.viewAuthor"))
    }

    @ViewBuilder
    private func avatar(_ urlString: String?, initial: String) -> some View {
        if let urlString, let url = URL(string: urlString) {
            AsyncImage(url: url) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                Circle().fill(TappyColor.surface)
            }
            .frame(width: 32, height: 32)
            .clipShape(Circle())
        } else {
            Circle()
                .fill(TappyColor.surface)
                .frame(width: 32, height: 32)
                .overlay(
                    Text(verbatim: String(initial.prefix(1)).uppercased())
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                )
        }
    }

    @ViewBuilder
    private func bodyText(_ review: Review) -> some View {
        if let text = review.body, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Text(verbatim: text)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text("reviewDetail.noBody")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
        }
    }

    @ViewBuilder
    private func hashtags(_ review: Review) -> some View {
        if let tags = review.hashtags, !tags.isEmpty {
            HStack(spacing: Spacing.xs) {
                ForEach(tags.prefix(6), id: \.self) { tag in
                    Text(verbatim: "#\(tag)")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.primary)
                }
            }
        }
    }

    @ViewBuilder
    private func actions(_ review: Review) -> some View {
        HStack(spacing: Spacing.lg) {
            actionButton(
                icon: review.likedByMe ? "heart.fill" : "heart",
                count: review.likeCount,
                labelKey: "review.action.like",
                tint: review.likedByMe ? .red : TappyColor.textSecondary
            ) { vm.toggleLike() }

            actionButton(
                icon: "bubble.right",
                count: vm.commentCount,
                labelKey: "review.action.comment",
                tint: TappyColor.textSecondary
            ) { vm.openComments() }

            actionButton(
                icon: review.savedByMe ? "bookmark.fill" : "bookmark",
                count: review.saveCount,
                labelKey: "review.action.save",
                tint: TappyColor.textSecondary
            ) { vm.toggleSave() }

            actionButton(
                icon: "square.and.arrow.up",
                count: nil,
                labelKey: "review.action.share",
                tint: TappyColor.textSecondary
            ) { vm.showShare = true }

            Spacer()
        }
        .padding(.top, Spacing.xs)
    }

    @ViewBuilder
    private func actionButton(
        icon: String,
        count: Int?,
        labelKey: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: Spacing.xxs) {
                Image(systemName: icon).foregroundStyle(tint)
                if let count {
                    Text(verbatim: "\(count)")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(LocalizedStringKey(labelKey)))
    }

    // MARK: - Helpers

    private func isExternalEmbed(_ review: Review) -> Bool {
        guard let st = review.sourceType else { return false }
        return ["youtube", "tiktok", "facebook"].contains(st)
    }

    /// Extracts a YouTube video id from the stored source url. Mirrors `ReviewPostView`'s handling
    /// of `sourceType == "youtube"` so the detail screen embeds the same clips the feed does.
    private func youTubeId(_ urlString: String?) -> String? {
        guard let urlString, let url = URL(string: urlString) else { return nil }
        if url.host?.contains("youtu.be") == true {
            let id = url.lastPathComponent
            return id.isEmpty ? nil : id
        }
        guard let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return nil }
        return items.first(where: { $0.name == "v" })?.value
    }
}
