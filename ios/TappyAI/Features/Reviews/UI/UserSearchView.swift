import SwiftUI

/// People search — the iOS counterpart of Android's `ReviewSearchSection` and the web's user
/// search. It was the last V2 feature with a surface on both other clients and none here.
@MainActor
final class UserSearchViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, searching, loaded, failed }

    @AppPublished var query: String = ""
    @AppPublished var state: LoadState = .idle
    @AppPublished var results: [UserSearchResult] = []
    @AppPublished var busyIds: Set<String> = []
    @AppPublished var followFailed = false
    /// What is searched: people (the original) or posts (web Explore search: place, text, hashtags).
    enum Mode: String, CaseIterable, Identifiable { case people, posts; var id: String { rawValue } }
    @AppPublished var mode: Mode = .people
    @AppPublished var posts: [Review] = []

    func setMode(_ new: Mode) {
        guard new != mode else { return }
        mode = new
        results = []
        posts = []
        search(query)
    }

    private let service: ReviewsService
    private let log = AppLogger.app
    private var inFlight: Task<Void, Never>?

    init(service: ReviewsService) {
        self.service = service
    }

    /// Debounced on purpose, and for the same reason the review composer's link field is: a
    /// per-keystroke request is a request per keystroke. 300ms is shorter than the composer's 600
    /// because search is a live-feedback control — the user is watching the list, not pasting.
    func search(_ text: String) {
        query = text
        inFlight?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            results = []
            posts = []
            state = .idle
            return
        }
        inFlight = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            state = .searching
            do {
                if mode == .posts {
                    let found = try await service.searchPosts(query: trimmed)
                    guard !Task.isCancelled else { return }
                    posts = found
                } else {
                    let found = try await service.searchUsers(query: trimmed)
                    guard !Task.isCancelled else { return }
                    results = found
                }
                state = .loaded
            } catch {
                guard !Task.isCancelled else { return }
                state = .failed
                log.error("user search failed: \(error)")
            }
        }
    }

    /// Follow / unfollow from a result. The route toggles, so the row shows the server's answer
    /// (and its recalculated follower count), never a guess.
    func toggleFollow(_ id: String) async {
        guard !busyIds.contains(id) else { return }
        busyIds.insert(id)
        do {
            let response = try await service.toggleFollow(userId: id)
            results = SocialLists.patch(results, id: id, isFollowing: response.following,
                                        followerCount: response.followerCount)
        } catch {
            log.error("follow toggle failed: \(error)")
            followFailed = true
        }
        busyIds.remove(id)
    }
}

struct UserSearchView: View {
    @AppStateObject private var vm: UserSearchViewModel
    @AppEnvironmentState private var router: AppRouter
    @ObservedObject private var safety: SafetyStore

    init(deps: AppDependencies) {
        _vm = AppStateObject(wrappedValue: UserSearchViewModel(service: ReviewsService(api: deps.api)))
        _safety = ObservedObject(wrappedValue: deps.safety)
    }

    /// App Review 1.2: people the person has blocked drop out of the list the moment they are blocked.
    private var shownResults: [UserSearchResult] { safety.visible(vm.results) { $0.id } }

    /// Posts: people the person blocked and posts they reported drop out, as in the feed.
    private var shownPosts: [Review] {
        safety.visible(vm.posts) { $0.userId }.filter { !safety.reportedReviewIds.contains($0.id) }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("search.title", selection: Binding(get: { vm.mode }, set: { vm.setMode($0) })) {
                Text("search.mode.people").tag(UserSearchViewModel.Mode.people)
                Text("search.mode.posts").tag(UserSearchViewModel.Mode.posts)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, Spacing.md)
            .padding(.top, Spacing.sm)

            TextField("search.placeholder", text: Binding(
                get: { vm.query },
                set: { vm.search($0) }
            ))
            .textFieldStyle(.roundedBorder)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .padding(Spacing.md)

            content
        }
        .background(TappyColor.background)
        .navigationTitle(Text("search.title"))
        .navigationBarTitleDisplayMode(.inline)
        .alert(NSLocalizedString("social.followError", comment: ""),
               isPresented: Binding(get: { vm.followFailed }, set: { vm.followFailed = $0 })) {
            Button(NSLocalizedString("common.ok", comment: "")) { vm.followFailed = false }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch vm.state {
        case .idle:
            // Not an error and not empty-results — the query is simply too short to send. Saying
            // "no one found" here would be a claim about people rather than about the query.
            TappyEmptyState(systemImage: "magnifyingglass", title: "search.hint")
                .padding(.top, 40)
            Spacer()
        case .searching:
            TappyLoadingIndicator().padding(.top, 40)
            Spacer()
        case .failed:
            TappyErrorState(
                presentation: .init(
                    title: NSLocalizedString("search.error.title", comment: ""),
                    message: NSLocalizedString("common.tryAgainLater", comment: ""),
                    retryable: true
                ),
                onRetry: { vm.search(vm.query) }
            )
            .padding(.top, 40)
            Spacer()
        case .loaded where vm.mode == .posts:
            if shownPosts.isEmpty {
                TappyEmptyState(systemImage: "text.magnifyingglass", title: "search.posts.noResults")
                    .padding(.top, 40)
                Spacer()
            } else {
                List(shownPosts) { post in
                    Button { router.push(ReviewsDestination.reviewDetail(id: post.id)) } label: {
                        VStack(alignment: .leading, spacing: Spacing.xxs) {
                            Text(verbatim: post.placeName ?? post.profiles?.fullName ?? "")
                                .font(TappyFont.bodyEmphasis)
                                .foregroundStyle(TappyColor.textPrimary)
                            if let body = post.body, !body.isEmpty {
                                Text(verbatim: body)
                                    .font(TappyFont.callout)
                                    .foregroundStyle(TappyColor.textSecondary)
                                    .lineLimit(2)
                            }
                            if let tags = post.hashtags, !tags.isEmpty {
                                Text(verbatim: tags.prefix(4).map { "#" + $0 }.joined(separator: " "))
                                    .font(TappyFont.caption)
                                    .foregroundStyle(TappyColor.textSecondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.plain)
            }
        case .loaded:
            if shownResults.isEmpty {
                TappyEmptyState(systemImage: "person.slash", title: "search.noResults")
                    .padding(.top, 40)
                Spacer()
            } else {
                // 🚨 C32 — this once pushed `ProfileDestination.account` for EVERY result, so
                // tapping any person opened YOUR OWN account screen: the destination ignored the
                // tapped user entirely. It was then left with no destination at all, because iOS
                // had no public-profile screen to push and a wrong destination is worse than none.
                //
                // `UserProfileView` now exists and carries the user's id, so the tap goes where
                // the row says it goes.
                List(shownResults) { user in
                    PersonRow(
                        person: user,
                        busy: vm.busyIds.contains(user.id),
                        onOpen: { router.push(ReviewsDestination.userProfile(id: user.id)) },
                        onFollow: { Task { await vm.toggleFollow(user.id) } }
                    )
                }
                .listStyle(.plain)
            }
        }
    }
}
