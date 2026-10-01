import SwiftUI

/// Someone else's profile — the native counterpart of the web's `/users/{id}`.
///
/// Header (avatar, name, follower/following/post counts, follow button) over a grid of their
/// public posts, each of which opens the review detail.
struct UserProfileView: View {
    @AppStateObject private var vm: UserProfileViewModel
    @AppEnvironmentState private var router: AppRouter
    @State private var pickedTab: Tab?
    @ObservedObject private var safety: SafetyStore
    @State private var safetyTarget: SafetyTarget?

    /// The web's visitor tabs (`v3.publicProfile.tabPosts` / `tabShares`, Android L10): "Chia sẻ" =
    /// rows with no real place (clips/links posted as "Chia sẻ"); "Bài đăng" = the rest.
    enum Tab { case posts, shares }

    private static func isShareOnly(_ review: Review) -> Bool {
        ComposerSentinel.isSharePlaceholder(review.placeName)
    }
    private var posts: [Review] { vm.reviews.filter { !Self.isShareOnly($0) } }
    private var shares: [Review] { vm.reviews.filter { Self.isShareOnly($0) } }
    /// The web opens on "Chia sẻ" when the creator has shares and no real-place posts.
    private var tab: Tab { pickedTab ?? (posts.isEmpty && !shares.isEmpty ? .shares : .posts) }
    private var shown: [Review] { tab == .shares ? shares : posts }

    init(deps: AppDependencies, userId: String) {
        _safety = ObservedObject(wrappedValue: deps.safety)
        _vm = AppStateObject(wrappedValue: UserProfileViewModel(
            userId: userId,
            service: ReviewsService(api: deps.api),
            session: deps.session
        ))
    }

    private let columns = [
        GridItem(.flexible(), spacing: 4),
        GridItem(.flexible(), spacing: 4),
        GridItem(.flexible(), spacing: 4),
    ]

    var body: some View {
        Group {
            switch vm.state {
            case .loading:
                VStack(spacing: Spacing.md) {
                    TappySkeleton().frame(height: 120)
                    TappySkeleton().frame(height: 200)
                }
                .padding(Spacing.md)

            case .notFound:
                TappyEmptyState(
                    systemImage: "person.slash",
                    title: "userProfile.notFound.title",
                    message: "userProfile.notFound.message"
                )

            case .failed(let error):
                TappyErrorState(presentation: ErrorPresenter.present(error)) {
                    Task { await vm.load() }
                }

            case .loaded:
                loaded
            }
        }
        .navigationTitle(Text("userProfile.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Report / block someone else (App Store 1.2). Signed-in visitors only, never on your own
            // profile, and only while a server safety flag is on.
            if vm.isAuthenticated, !vm.isSelf, safety.flags.anyEnabled, vm.profile != nil {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        safetyTarget = SafetyTarget(kind: .user, targetId: vm.userId, authorId: vm.userId,
                                                    authorName: vm.profile?.displayName, summary: vm.profile?.displayName)
                    } label: { Image(systemName: "ellipsis") }
                    .accessibilityLabel(Text("safety.menu"))
                    .accessibilityIdentifier("profile-safety")
                }
            }
        }
        .sheet(item: $safetyTarget) { target in
            SafetySheet(target: target, safety: safety) { safetyTarget = nil }
        }
        .task { await vm.load() }
    }

    private var loaded: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                header
                tabPicker
                Divider().overlay(TappyColor.separator)
                grid
                    .padding(.horizontal, Spacing.xs)
                if vm.isLoadingMore {
                    TappyLoadingIndicator().padding(Spacing.md)
                }
            }
            .padding(.bottom, Spacing.xl)
        }
    }

    @ViewBuilder
    private var header: some View {
        VStack(spacing: Spacing.sm) {
            avatar
            Text(verbatim: vm.profile?.displayName ?? "")
                .font(TappyFont.title)
                .foregroundStyle(TappyColor.textPrimary)

            HStack(spacing: Spacing.lg) {
                stat(count: vm.profile?.reviewCount ?? 0, labelKey: "userProfile.stat.posts")
                stat(count: vm.profile?.followerCount ?? 0, labelKey: "userProfile.stat.followers")
                stat(count: vm.profile?.followingCount ?? 0, labelKey: "userProfile.stat.following")
            }

            followButton
        }
        .padding(.horizontal, Spacing.md)
        .padding(.top, Spacing.md)
    }

    @ViewBuilder
    private var avatar: some View {
        if let raw = vm.profile?.avatarUrl, let url = URL(string: raw) {
            AsyncImage(url: url) { image in
                image.resizable().aspectRatio(contentMode: .fill)
            } placeholder: {
                Circle().fill(TappyColor.surface)
            }
            .frame(width: 84, height: 84)
            .clipShape(Circle())
        } else {
            Circle()
                .fill(TappyColor.surface)
                .frame(width: 84, height: 84)
                .overlay(
                    Image(systemName: "person.fill")
                        .font(.system(size: 34))
                        .foregroundStyle(TappyColor.textSecondary)
                )
        }
    }

    private func stat(count: Int, labelKey: String) -> some View {
        VStack(spacing: Spacing.xxs) {
            Text(verbatim: "\(count)")
                .font(TappyFont.headline)
                .foregroundStyle(TappyColor.textPrimary)
            Text(LocalizedStringKey(labelKey))
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
        }
    }

    @ViewBuilder
    private var followButton: some View {
        // Own profile: no follow control at all. Signed out: the control is shown but disabled,
        // rather than hidden — hiding it would make the profile look like a page where following
        // is not a thing, instead of one that needs an account.
        if vm.isSelf {
            EmptyView()
        } else {
            let following = vm.profile?.isFollowing ?? false
            let titleKey = LocalizedStringKey(following ? "userProfile.following" : "userProfile.follow")
            Button(titleKey) {
                vm.toggleFollow()
            }
            .buttonStyle(.tappy(following ? .secondary : .primary))
            .frame(width: 168)   // a pill, not a full-width bar (web / Android)
            .disabled(!vm.isAuthenticated || vm.isTogglingFollow)
        }
    }

    private var tabPicker: some View {
        HStack(spacing: 0) {
            ForEach([Tab.posts, Tab.shares], id: \.self) { t in
                Button { pickedTab = t } label: {
                    VStack(spacing: 6) {
                        Text(LocalizedStringKey(t == .posts ? "userProfile.tab.posts" : "userProfile.tab.shares"))
                            .font(TappyFont.callout.weight(tab == t ? .semibold : .regular))
                            .foregroundStyle(tab == t ? TappyColor.textPrimary : TappyColor.textSecondary)
                        Rectangle().fill(tab == t ? TappyColor.primary : Color.clear).frame(height: 2)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == t ? .isSelected : [])
                .accessibilityIdentifier(t == .posts ? "profile-tab-posts" : "profile-tab-shares")
            }
        }
    }

    @ViewBuilder
    private var grid: some View {
        if shown.isEmpty {
            TappyEmptyState(
                systemImage: "square.grid.2x2",
                title: "userProfile.empty.title",
                message: "userProfile.empty.message"
            )
        } else {
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(shown) { review in
                    Button {
                        router.push(ReviewsDestination.reviewDetail(id: review.id))
                    } label: {
                        tile(review)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        if review.id == vm.reviews.last?.id {
                            Task { await vm.loadMore() }
                        }
                    }
                }
            }
        }
    }

    private func tile(_ review: Review) -> some View {
        // 🚨 The tile's SIZE comes from a clear 3:4 box; the picture is an overlay clipped to it. Before, the
        // `.fill` image sized the tile itself, so wide photos pushed the grid past the screen edge (tiles
        // offset, overlapping, the whole page shifted — even the tab underline).
        Color.clear
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .overlay {
                ZStack {
                    TappyColor.surface
                    if let raw = review.thumbnail ?? review.photos?.first, let url = URL(string: raw) {
                        AsyncImage(url: url) { image in
                            image.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            TappyColor.surface
                        }
                    } else {
                        Image(systemName: review.isVideo ? "play.rectangle" : "photo")
                            .font(.system(size: 22))
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    if review.isVideo {
                        VStack {
                            HStack {
                                Spacer()
                                Image(systemName: "play.fill")
                                    .font(TappyFont.caption)
                                    .foregroundStyle(.white)
                                    .padding(Spacing.xxs)
                            }
                            Spacer()
                        }
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
            .accessibilityLabel(Text("userProfile.openPost"))
    }
}
