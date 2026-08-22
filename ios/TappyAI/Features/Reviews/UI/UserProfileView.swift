import SwiftUI

/// Someone else's profile — the native counterpart of the web's `/users/{id}`.
///
/// Header (avatar, name, follower/following/post counts, follow button) over a grid of their
/// public posts, each of which opens the review detail.
struct UserProfileView: View {
    @AppStateObject private var vm: UserProfileViewModel
    @AppEnvironmentState private var router: AppRouter

    init(deps: AppDependencies, userId: String) {
        _vm = AppStateObject(wrappedValue: UserProfileViewModel(
            userId: userId,
            service: ReviewsService(api: deps.api),
            session: deps.session
        ))
    }

    private let columns = [
        GridItem(.flexible(), spacing: 2),
        GridItem(.flexible(), spacing: 2),
        GridItem(.flexible(), spacing: 2),
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
        .task { await vm.load() }
    }

    private var loaded: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                header
                Divider().overlay(TappyColor.separator)
                grid
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
            .disabled(!vm.isAuthenticated || vm.isTogglingFollow)
        }
    }

    @ViewBuilder
    private var grid: some View {
        if vm.reviews.isEmpty {
            TappyEmptyState(
                systemImage: "square.grid.2x2",
                title: "userProfile.empty.title",
                message: "userProfile.empty.message"
            )
        } else {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(vm.reviews) { review in
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
        .aspectRatio(3.0 / 4.0, contentMode: .fill)
        .clipped()
        .accessibilityLabel(Text("userProfile.openPost"))
    }
}
