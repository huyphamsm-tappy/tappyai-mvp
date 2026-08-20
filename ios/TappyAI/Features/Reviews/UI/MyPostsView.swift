import SwiftUI

/// The author's own posts — iOS counterpart of the web's `/profile/posts` and Android's
/// My Reviews grid. See `MyPostsViewModel` for why this screen is release-critical rather than
/// convenient.
struct MyPostsView: View {
    @AppStateObject private var vm: MyPostsViewModel

    init(deps: AppDependencies) {
        _vm = AppStateObject(wrappedValue: MyPostsViewModel(service: ReviewsService(api: deps.api)))
    }

    private let columns = [
        GridItem(.flexible(), spacing: Spacing.xs),
        GridItem(.flexible(), spacing: Spacing.xs),
        GridItem(.flexible(), spacing: Spacing.xs),
    ]

    var body: some View {
        Group {
            switch vm.state {
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
                    onRetry: { Task { await vm.load() } }
                )
                .padding(.top, 60)
            case .loaded:
                if vm.posts.isEmpty {
                    // `title` is a LocalizedStringKey — the key is passed, not a resolved String.
                    TappyEmptyState(systemImage: "square.grid.3x3", title: "myPosts.empty")
                        .padding(.top, 60)
                } else {
                    grid
                }
            }
        }
        .background(TappyColor.background)
        .navigationTitle(Text("myPosts.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .refreshable { await vm.load() }
    }

    private var grid: some View {
        ScrollView {
            // The held-post explanation sits ABOVE the grid, not behind a tap.
            //
            // 🚨 Deliberate: a badge alone tells someone something is wrong without telling them
            // what, and the natural response to a post that seems to have silently failed is to
            // delete it and try again — which loses the post and repeats the outcome. The server's
            // own wording, already in the request language, is shown before any action is reachable.
            if let notice = vm.heldPosts.first?.moderation {
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
                ForEach(vm.posts) { post in
                    tile(post)
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
                badge(NSLocalizedString("myPosts.badge.hidden", comment: ""), color: TappyColor.textSecondary)
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
