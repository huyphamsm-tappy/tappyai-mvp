import SwiftUI

/// The signed-in user's own profile content — the five personal collections (`OwnCollection`),
/// the iOS counterpart of Android's self profile and the web's `/profile` hub. See
/// `MyPostsViewModel` for why the posts half is release-critical rather than convenient.
///
/// Chips: Bài viết / Đã thích / Đã lưu / Đã ẩn / Đã share, in that order (the cross-platform
/// contract). Each collection has its own loading / empty / error / loaded state. Saved PLACES
/// are `FavoritesView`, a separate surface, not a sixth chip.
///
/// 🚨 A GUEST SEES THE SIGN-IN GATE, AND NOTHING IS REQUESTED. An anonymous session is a guest:
/// `session.state.isAuthenticated` is the rule (the same one Android's self profile applies),
/// and the view model refuses to load while it is false. Sign-out mid-screen clears every
/// collection the moment the state flips, so the next account never sees the previous one's.
struct MyPostsView: View {
    @AppStateObject private var vm: MyPostsViewModel
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var session: SessionStore

    @State private var collection: OwnCollection = .posts
    @State private var showAuth = false

    private let deps: AppDependencies

    /// Whether this post exists at the public detail URL. A post the safety gate has held, or one
    /// the author has hidden, does not — the route applies both filters with no author exemption.
    private func isOpenable(_ post: Review) -> Bool {
        post.moderation?.state.isPublished != false && post.isHidden != true
    }

    init(deps: AppDependencies) {
        self.deps = deps
        _vm = AppStateObject(wrappedValue: MyPostsViewModel(service: ReviewsService(api: deps.api), session: deps.session))
    }

    private let columns = [
        GridItem(.flexible(), spacing: Spacing.xs),
        GridItem(.flexible(), spacing: Spacing.xs),
        GridItem(.flexible(), spacing: Spacing.xs),
    ]

    var body: some View {
        Group {
            if session.state.isAuthenticated {
                VStack(spacing: 0) {
                    chipRow
                    content
                }
            } else {
                signInGate
            }
        }
        .background(TappyColor.background)
        .navigationTitle(Text("myPosts.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: collection) { await vm.load(collection) }
        .refreshable { await vm.reload(collection) }
        // Sign-out cleanup: the collections belong to the account that loaded them.
        .onChange(of: session.state.isAuthenticated) { authenticated in
            if !authenticated { vm.clear() }
        }
        .fullScreenCover(isPresented: $showAuth) {
            AuthFlowView(repo: deps.authRepository, config: deps.configService) { showAuth = false }
        }
    }

    // MARK: - Gate

    /// The guest state — the login-required screen, with the one action that resolves it.
    private var signInGate: some View {
        TappyEmptyState(
            systemImage: "person.crop.circle.badge.exclamationmark",
            title: "collections.signInRequired.title",
            message: "collections.signInRequired.message",
            actionTitle: "auth.signIn",
            action: { showAuth = true }
        )
        .padding(.top, 60)
        .accessibilityIdentifier("collections.signInGate")
    }

    // MARK: - Chips

    private var chipRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                ForEach(OwnCollection.allCases) { c in
                    Button {
                        collection = c
                    } label: {
                        Label(LocalizedStringKey(c.titleKey), systemImage: c.systemImage)
                            .font(TappyFont.footnote)
                            .foregroundStyle(collection == c ? TappyColor.onPrimary : TappyColor.textPrimary)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, 6)
                            .background(collection == c ? TappyColor.primary : TappyColor.surface, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("collections.chip.\(c.rawValue)")
                    .accessibilityAddTraits(collection == c ? [.isSelected] : [])
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        switch vm.state(of: collection) {
        case .idle, .loading:
            ScrollView {
                LazyVGrid(columns: columns, spacing: Spacing.xs) {
                    ForEach(0..<9, id: \.self) { _ in
                        TappySkeleton().aspectRatio(3.0 / 4.0, contentMode: .fill)
                    }
                }
                .padding(Spacing.md)
            }
        case .failed:
            // `Presentation` takes plain Strings (it is built off AppError elsewhere), so the
            // keys are resolved here rather than handed over as LocalizedStringKey.
            TappyErrorState(
                presentation: .init(
                    title: NSLocalizedString("myPosts.error.title", comment: ""),
                    message: NSLocalizedString("myPosts.error.message", comment: ""),
                    retryable: true
                ),
                onRetry: { Task { await vm.reload(collection) } }
            )
            .padding(.top, 60)
        case .loaded:
            switch collection {
            case .posts:
                if vm.publicPosts.isEmpty {
                    // `title` is a LocalizedStringKey — the key is passed, not a resolved String.
                    TappyEmptyState(systemImage: "square.grid.3x3", title: "myPosts.empty")
                        .padding(.top, 60)
                } else {
                    ownGrid(vm.publicPosts, showNotice: true)
                }
            case .hidden:
                if vm.hiddenPosts.isEmpty {
                    TappyEmptyState(systemImage: "eye.slash", title: LocalizedStringKey(collection.emptyKey))
                        .padding(.top, 60)
                } else {
                    ownGrid(vm.hiddenPosts, showNotice: false)
                }
            case .liked:
                collectionGrid(vm.liked)
            case .saved:
                collectionGrid(vm.saved)
            case .shared:
                collectionGrid(vm.shared)
            }
        }
    }

    // MARK: - Liked / Saved / Shared

    /// A compact collection — every row is a public post the server has already gated, so every
    /// tile opens the detail screen (which fetches the full review by id).
    @ViewBuilder
    private func collectionGrid(_ rows: [CollectionReview]) -> some View {
        if rows.isEmpty {
            TappyEmptyState(systemImage: collection.systemImage, title: LocalizedStringKey(collection.emptyKey))
                .padding(.top, 60)
        } else {
            ScrollView {
                LazyVGrid(columns: columns, spacing: Spacing.xs) {
                    ForEach(rows) { row in
                        Button {
                            router.push(ReviewsDestination.reviewDetail(id: row.id), on: .profile)
                        } label: {
                            collectionTile(row)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(Spacing.md)
            }
        }
    }

    private func collectionTile(_ row: CollectionReview) -> some View {
        ZStack(alignment: .bottomLeading) {
            Rectangle().fill(TappyColor.surfaceElevated)
            if let url = row.thumbnail ?? row.photos?.first, let parsed = URL(string: url) {
                AsyncImage(url: parsed) { phase in
                    if case .success(let image) = phase {
                        image.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Color.clear
                    }
                }
            } else {
                Text(row.body ?? "")
                    .font(TappyFont.footnote)
                    .foregroundStyle(TappyColor.textSecondary)
                    .lineLimit(4)
                    .padding(Spacing.xs)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            if row.isVideo {
                Image(systemName: "play.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(Spacing.xs)
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fill)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Posts / Hidden (the author's own rows)

    private func ownGrid(_ rows: [Review], showNotice: Bool) -> some View {
        ScrollView {
            // The held-post explanation sits ABOVE the grid, not behind a tap.
            //
            // 🚨 Deliberate: a badge alone tells someone something is wrong without telling them
            // what, and the natural response to a post that seems to have silently failed is to
            // delete it and try again — which loses the post and repeats the outcome. The server's
            // own wording, already in the request language, is shown before any action is reachable.
            if showNotice, let notice = vm.heldPosts.first?.moderation {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Label(notice.title, systemImage: "exclamationmark.triangle.fill")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.warning)
                    Text(notice.detail)
                        .font(TappyFont.footnote)
                        .foregroundStyle(TappyColor.textSecondary)
                    if vm.heldPosts.count > 1 {
                        Text("myPosts.held.count \(vm.heldPosts.count)")
                            .font(TappyFont.footnote)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Spacing.md)
                .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, Spacing.md)
                .padding(.top, Spacing.sm)
            }

            LazyVGrid(columns: columns, spacing: Spacing.xs) {
                ForEach(rows) { post in
                    // A tile opens the post, matching Android's My Reviews and the web's grid.
                    // The long-press menu (hide / delete) still hangs off `tile` itself.
                    //
                    // 🚨 Only for posts that are actually reachable. A held or hidden post 404s on
                    // the public detail route by design, and sending its author there would answer
                    // a question they did not ask ("is it public?") in the least useful way — with
                    // an error. Its state is already explained above the grid (held) or by the
                    // eye-off veil (hidden), and the context menu is where "show again" lives.
                    if isOpenable(post) {
                        Button {
                            router.push(ReviewsDestination.reviewDetail(id: post.id), on: .profile)
                        } label: {
                            tile(post)
                        }
                        .buttonStyle(.plain)
                    } else {
                        tile(post)
                    }
                }
            }
            .padding(Spacing.md)
        }
        .alert(
            Text("myPosts.delete.confirm"),
            isPresented: Binding(get: { vm.pendingDelete != nil }, set: { if !$0 { vm.pendingDelete = nil } })
        ) {
            Button(role: .destructive) {
                if let p = vm.pendingDelete { Task { await vm.delete(p) } }
            } label: { Text("common.delete") }
            Button(role: .cancel) { vm.pendingDelete = nil } label: { Text("common.cancel") }
        }
    }

    private func tile(_ post: Review) -> some View {
        ZStack(alignment: .topLeading) {
            Rectangle().fill(TappyColor.surfaceElevated)
            if let url = post.thumbnail ?? post.photos?.first, let parsed = URL(string: url) {
                AsyncImage(url: parsed) { phase in
                    if case .success(let image) = phase {
                        image.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Color.clear
                    }
                }
            } else {
                Text(post.body ?? "")
                    .font(TappyFont.footnote)
                    .foregroundStyle(TappyColor.textSecondary)
                    .lineLimit(4)
                    .padding(Spacing.xs)
            }

            // Two DIFFERENT states, never merged into one badge: the platform held it, or the
            // author hid it. Only the second is reversible by the person looking at it.
            if post.moderation?.state.isPublished == false {
                badge(NSLocalizedString("myPosts.badge.notPublic", comment: ""), color: TappyColor.warning)
            } else if post.isHidden == true {
                // The eye-off veil — Android's `HiddenVeil`, the web's `data-hidden-veil`.
                Color.black.opacity(0.55)
                VStack(spacing: Spacing.xxs) {
                    Image(systemName: "eye.slash")
                        .font(.system(size: 20, weight: .semibold))
                    Text("myPosts.badge.hidden")
                        .font(TappyFont.caption)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fill)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .contextMenu {
            Button {
                Task { await vm.toggleHidden(post) }
            } label: {
                Label(
                    post.isHidden == true ? NSLocalizedString("myPosts.action.show", comment: "") : NSLocalizedString("myPosts.action.hide", comment: ""),
                    systemImage: post.isHidden == true ? "eye" : "eye.slash"
                )
            }
            Button(role: .destructive) {
                vm.pendingDelete = post
            } label: {
                Label(NSLocalizedString("common.delete", comment: ""), systemImage: "trash")
            }
        }
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(TappyFont.caption)
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color, in: Capsule())
            .padding(Spacing.xs)
    }
}
