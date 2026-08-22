import SwiftUI

/// People search — the iOS counterpart of Android's `ReviewSearchSection` and the web's user
/// search. It was the last V2 feature with a surface on both other clients and none here.
@MainActor
final class UserSearchViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, searching, loaded, failed }

    @AppPublished var query: String = ""
    @AppPublished var state: LoadState = .idle
    @AppPublished var results: [UserSearchResult] = []

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
            state = .idle
            return
        }
        inFlight = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            state = .searching
            do {
                let found = try await service.searchUsers(query: trimmed)
                guard !Task.isCancelled else { return }
                results = found
                state = .loaded
            } catch {
                guard !Task.isCancelled else { return }
                state = .failed
                log.error("user search failed: \(error)")
            }
        }
    }
}

struct UserSearchView: View {
    @AppStateObject private var vm: UserSearchViewModel
    @AppEnvironmentState private var router: AppRouter

    init(deps: AppDependencies) {
        _vm = AppStateObject(wrappedValue: UserSearchViewModel(service: ReviewsService(api: deps.api)))
    }

    var body: some View {
        VStack(spacing: 0) {
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
        case .loaded:
            if vm.results.isEmpty {
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
                List(vm.results) { user in
                    Button {
                        router.push(ReviewsDestination.userProfile(id: user.id))
                    } label: {
                        row(user)
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.plain)
            }
        }
    }

    private func row(_ user: UserSearchResult) -> some View {
        HStack(spacing: Spacing.sm) {
            avatar(user)
            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName)
                    .font(TappyFont.body)
                    .foregroundStyle(TappyColor.textPrimary)
                Text("search.followerCount \(user.followerCount ?? 0)")
                    .font(TappyFont.footnote)
                    .foregroundStyle(TappyColor.textSecondary)
            }
            Spacer()
            if user.isFollowing == true {
                Text("search.following")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func avatar(_ user: UserSearchResult) -> some View {
        if let url = user.avatarUrl, let parsed = URL(string: url) {
            AsyncImage(url: parsed) { phase in
                if case .success(let image) = phase {
                    image.resizable().aspectRatio(contentMode: .fill)
                } else {
                    Circle().fill(TappyColor.surfaceElevated)
                }
            }
            .frame(width: 40, height: 40)
            .clipShape(Circle())
        } else {
            Circle()
                .fill(TappyColor.surfaceElevated)
                .frame(width: 40, height: 40)
                .overlay(
                    Image(systemName: "person.fill")
                        .foregroundStyle(TappyColor.textSecondary)
                )
        }
    }
}
