import SwiftUI

/// Following / Followers — the iOS counterpart of the web's `/social` (`SocialView.tsx`).
///
/// Only what the product has: one directional `user_follows` graph. No friend requests, no
/// suggestions, no mutual counts — the web page omits them for the same reason.
@MainActor
final class SocialViewModel: AppObservableObject {
    enum ListState: Equatable { case loading, loaded, unavailable, signIn, failed }

    @AppPublished var tab: SocialConnectionType = .following
    @AppPublished var lists = SocialLists()
    @AppPublished var state: ListState = .loading
    @AppPublished var busyIds: Set<String> = []
    @AppPublished var followFailed = false

    private let social: SocialService
    private let reviews: ReviewsService
    private let log = AppLogger.app

    init(api: APIClient) {
        social = SocialService(api: api)
        reviews = ReviewsService(api: api)
    }

    func select(_ type: SocialConnectionType) {
        tab = type
        if lists[type] == nil {
            Task { await load(type) }
        } else {
            state = .loaded
        }
    }

    func load(_ type: SocialConnectionType) async {
        if type == tab { state = .loading }
        let result: Result<[UserSearchResult], Error>
        do {
            result = .success(try await social.connections(type))
        } catch {
            log.error("social connections failed: \(error)")
            result = .failure(error)
        }
        let outcome = SocialLoadOutcome.from(result)
        if case .loaded(let users) = outcome { lists[type] = users }
        guard type == tab else { return }
        switch outcome {
        case .loaded: state = .loaded
        case .unavailable: state = .unavailable
        case .signIn: state = .signIn
        case .failed: state = .failed
        }
    }

    /// `POST /api/users/[id]/follow` toggles, so the button waits for the server's answer
    /// instead of guessing (web `PersonCard`).
    func toggleFollow(_ id: String) async {
        guard !busyIds.contains(id) else { return }
        busyIds.insert(id)
        do {
            let response = try await reviews.toggleFollow(userId: id)
            lists.applyFollowChange(id: id, isFollowing: response.following, followerCount: response.followerCount)
            busyIds.remove(id)
            if tab == .following { await load(.following) }
        } catch {
            busyIds.remove(id)
            log.error("follow toggle failed: \(error)")
            followFailed = true
        }
    }
}

struct SocialView: View {
    @AppStateObject private var vm: SocialViewModel
    @AppEnvironmentState private var router: AppRouter
    @ObservedObject private var safety: SafetyStore

    init(deps: AppDependencies) {
        _vm = AppStateObject(wrappedValue: SocialViewModel(api: deps.api))
        _safety = ObservedObject(wrappedValue: deps.safety)
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker(selection: Binding(get: { vm.tab }, set: { vm.select($0) })) {
                ForEach(SocialConnectionType.allCases) { type in
                    Text(LocalizedStringKey(type.tabKey)).tag(type)
                }
            } label: {
                Text("social.title")
            }
            .pickerStyle(.segmented)
            .padding(Spacing.md)

            content
        }
        .background(TappyColor.background)
        .navigationTitle(Text("social.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { findPeople() } label: { Image(systemName: "person.badge.plus") }
                    .accessibilityLabel(Text("social.findPeople"))
            }
        }
        .alert(NSLocalizedString("social.followError", comment: ""),
               isPresented: Binding(get: { vm.followFailed }, set: { vm.followFailed = $0 })) {
            Button(NSLocalizedString("common.ok", comment: "")) { vm.followFailed = false }
        }
        .task {
            if vm.lists[vm.tab] == nil { await vm.load(vm.tab) }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch vm.state {
        case .loading:
            TappyLoadingIndicator().padding(.top, 40)
            Spacer()
        case .unavailable:
            // Production: the lists route is not deployed there yet. Search and follow are.
            TappyEmptyState(systemImage: "person.2", title: "social.unavailable",
                            actionTitle: "social.findPeople", action: findPeople)
                .padding(.top, 40)
            Spacer()
        case .signIn:
            TappyEmptyState(systemImage: "person.2", title: "social.signIn")
                .padding(.top, 40)
            Spacer()
        case .failed:
            TappyErrorState(
                presentation: .init(
                    title: NSLocalizedString("social.error", comment: ""),
                    message: NSLocalizedString("common.tryAgainLater", comment: ""),
                    retryable: true
                ),
                onRetry: { Task { await vm.load(vm.tab) } }
            )
            .padding(.top, 40)
            Spacer()
        case .loaded:
            // App Review 1.2: a blocked person leaves these lists at once.
            let people = safety.visible(vm.lists[vm.tab] ?? []) { $0.id }
            if people.isEmpty {
                TappyEmptyState(systemImage: "person.2", title: LocalizedStringKey(vm.tab.emptyKey),
                                actionTitle: "social.findPeople", action: findPeople)
                    .padding(.top, 40)
                Spacer()
            } else {
                List(people) { person in
                    PersonRow(
                        person: person,
                        followsYou: vm.tab == .followers,
                        busy: vm.busyIds.contains(person.id),
                        onOpen: { router.push(ReviewsDestination.userProfile(id: person.id)) },
                        onFollow: { Task { await vm.toggleFollow(person.id) } }
                    )
                }
                .listStyle(.plain)
                .refreshable { await vm.load(vm.tab) }
            }
        }
    }

    private func findPeople() {
        router.push(ProfileDestination.userSearch, on: .profile)
    }
}

/// One person with a follow button — shared by the Social lists and people search.
/// The name/avatar opens the public profile; the button only toggles the follow.
struct PersonRow: View {
    let person: UserSearchResult
    var followsYou = false
    var busy = false
    let onOpen: () -> Void
    let onFollow: () -> Void

    var body: some View {
        HStack(spacing: Spacing.sm) {
            Button(action: onOpen) {
                HStack(spacing: Spacing.sm) {
                    avatar
                    VStack(alignment: .leading, spacing: 2) {
                        Text(person.displayName)
                            .font(TappyFont.body)
                            .foregroundStyle(TappyColor.textPrimary)
                            .lineLimit(1)
                        HStack(spacing: Spacing.xs) {
                            Text("search.followerCount \(person.followerCount ?? 0)")
                                .font(TappyFont.footnote)
                                .foregroundStyle(TappyColor.textSecondary)
                            if followsYou {
                                Text("social.followsYou")
                                    .font(TappyFont.caption)
                                    .foregroundStyle(TappyColor.primary)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(TappyColor.primary.opacity(0.1))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(Text("social.viewProfile"))

            FollowButton(isFollowing: person.isFollowing == true, busy: busy, action: onFollow)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var avatar: some View {
        if let url = person.avatarUrl, let parsed = URL(string: url) {
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

struct FollowButton: View {
    let isFollowing: Bool
    let busy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if busy {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: isFollowing ? "checkmark" : "person.badge.plus")
                }
                Text(LocalizedStringKey(isFollowing ? "social.following" : "social.follow"))
            }
            .font(.system(size: 12.5, weight: .semibold))
            .padding(.horizontal, 12)
            .frame(minHeight: 34)
            .foregroundStyle(isFollowing ? TappyColor.textPrimary : Color.white)
            .background(isFollowing ? TappyColor.surface : TappyColor.primary)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityAddTraits(isFollowing ? .isSelected : [])
    }
}
