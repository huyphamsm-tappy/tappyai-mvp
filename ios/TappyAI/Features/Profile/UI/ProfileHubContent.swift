import SwiftUI

/// The signed-in hub's content — the web `/profile` (`ProfileView.tsx`) and Android `ProfileHubV3`:
/// the hero (cover, avatar, name, bio, Edit + QR, three stats), the content panel with the web's
/// tabs in the web's order — Đã đăng / Đã chia sẻ / Đã lưu / Bị hạn chế / Đã ẩn / Địa điểm — and the
/// Following preview. Read through the routes the app already has and nothing else:
///
///  - stats: `GET /api/users/{me}` (follower / following counts); likes = the sum of `like_count`
///    over the user's own posts (what the web sums server-side);
///  - Đã đăng / Bị hạn chế / Đã ẩn: the three halves of `GET /api/reviews/mine` — hidden by the author,
///    held by the safety gate (fail-closed: anything not explicitly published), and the rest;
///  - Đã chia sẻ `/api/reviews/shared`, Đã lưu `/api/reviews/saved`, Địa điểm `/api/favorites`;
///  - Following preview: `GET /api/social/connections?type=following`.
///
/// Every number renders only once its read returned — never a zero the server did not send.
enum ProfileHubTab: String, CaseIterable, Identifiable {
    case posts, shared, saved, restricted, hidden, places
    var id: String { rawValue }
    // 🚨 Concatenate, never interpolate: `LocalizedStringKey("a.\(x)")` becomes the FORMAT key
    // "a.%@" and the chip showed the raw key (CI screenshot 16, 30/09).
    var titleKey: LocalizedStringKey { LocalizedStringKey("profileHub.tab." + rawValue) }
    var emptyKey: LocalizedStringKey { LocalizedStringKey("profileHub.empty." + rawValue) }
}

@MainActor
final class ProfileHubViewModel: AppObservableObject {
    @AppPublished var tab: ProfileHubTab = .posts
    @AppPublished var stats: PublicUserProfile?
    /// Every row `/mine` returned; posts / restricted / hidden are its three parts.
    @AppPublished var mine: [Review]?
    @AppPublished var shared: [CollectionReview]?
    @AppPublished var saved: [CollectionReview]?
    @AppPublished var places: [Favorite]?
    @AppPublished var following: [UserSearchResult]?
    @AppPublished var failed = false

    private let reviews: ReviewsService
    private let placesService: PlacesService
    private let social: SocialService
    private var loadedFor: String?

    init(api: APIClient) {
        reviews = ReviewsService(api: api)
        placesService = PlacesService(api: api)
        social = SocialService(api: api)
    }

    var posts: [Review]? { mine?.filter { $0.isHidden != true && !Self.isHeld($0) } }
    var restricted: [Review]? { mine?.filter { $0.isHidden != true && Self.isHeld($0) } }
    var hidden: [Review]? { mine?.filter { $0.isHidden == true } }
    /// Sum of `like_count` over the user's own posts; nil until `/mine` returned.
    var likes: Int? { mine?.reduce(0) { $0 + $1.likeCount } }

    /// A moderation payload that is not an explicit PUBLISHED. No payload = predates the gate = public.
    static func isHeld(_ r: Review) -> Bool { r.moderation.map { !$0.state.isPublished } ?? false }

    func load(userId: String?, force: Bool = false) async {
        guard let userId else { return }
        if loadedFor == userId && !force { return }
        loadedFor = userId
        failed = false
        async let statsTask = try? reviews.fetchUserProfile(userId: userId)
        async let mineTask = try? reviews.fetchMyReviews().reviews
        async let sharedTask = try? reviews.fetchSharedReviews().reviews
        async let savedTask = try? reviews.fetchSavedReviews().reviews
        async let placesTask = try? placesService.fetchFavorites()
        async let followingTask = try? social.connections(.following)
        stats = await statsTask
        mine = await mineTask
        shared = await sharedTask
        saved = await savedTask
        places = await placesTask
        following = await followingTask.map { Array($0.prefix(5)) }
        failed = mine == nil
    }
}

// MARK: - Hero

struct ProfileHeroView: View {
    let profile: UserProfile?
    let stats: PublicUserProfile?
    let likes: Int?
    let onEdit: () -> Void
    let onQR: () -> Void

    private var name: String {
        let n = profile?.fullName.trimmingCharacters(in: .whitespaces) ?? ""
        return n.isEmpty ? NSLocalizedString("profile.fallbackName", comment: "") : n
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("profileHub.breadcrumb").font(.system(size: 11, weight: .medium)).tracking(1.3)
                .foregroundStyle(TappyColor.textSecondary)
                .padding(.leading, 20).padding(.top, 16)
            // The cover (`cover_url`, set on Edit profile) when there is one; else the gradient band.
            ZStack {
                LinearGradient(colors: [Color(hex: 0x8B5CF6, alpha: 0.5), TappyColor.primary.opacity(0.5), TappyColor.surface],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                if let raw = profile?.coverUrl, !raw.isEmpty, let url = URL(string: raw) {
                    AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: { Color.clear }
                }
            }
            .frame(height: 96).frame(maxWidth: .infinity).clipped()
            .padding(.top, 12)
            .accessibilityIdentifier("profile-hero-cover")

            VStack(alignment: .leading, spacing: 12) {
                avatar.offset(y: -40).padding(.bottom, -40)
                Text(name).font(.system(size: 20, weight: .bold)).foregroundStyle(TappyColor.textPrimary).lineLimit(1)
                if let bio = profile?.bio, !bio.isEmpty {
                    Text(bio).font(.system(size: 14)).foregroundStyle(TappyColor.textSecondary).lineLimit(3)
                }
                HStack(spacing: 8) {
                    Button(action: onEdit) {
                        Label("profileHub.edit", systemImage: "pencil")
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(TappyColor.primary).clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("profile-edit")
                    Button(action: onQR) {
                        Image(systemName: "qrcode").font(.system(size: 18)).foregroundStyle(TappyColor.textPrimary)
                            .frame(width: 44, height: 40)
                            .background(TappyColor.surface).clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("qr.title"))
                }
                HStack(spacing: 0) {
                    stat(stats?.followerCount, "profileHub.stat.followers")
                    stat(stats?.followingCount, "profileHub.stat.following")
                    stat(likes, "profileHub.stat.likes")
                }
            }
            .padding(.horizontal, 20).padding(.bottom, 20)
        }
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        // No container identifier (it would override "profile-edit"); tests find the hero by its parts.
    }

    private var avatar: some View {
        ZStack {
            Circle().fill(TappyColor.cardBackground).frame(width: 84, height: 84)
            if let raw = profile?.avatarUrl, !raw.isEmpty, let url = URL(string: raw) {
                AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: { TappyColor.surface }
                    .frame(width: 76, height: 76).clipShape(Circle())
            } else {
                Text(String(name.prefix(1)).uppercased()).font(.system(size: 28, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 76, height: 76).background(Circle().fill(TappyColor.primary))
            }
        }
    }

    private func stat(_ value: Int?, _ key: LocalizedStringKey) -> some View {
        VStack(spacing: 2) {
            // A stat renders only once the server sent it.
            Text(value.map(String.init) ?? "–").font(.system(size: 18, weight: .bold)).foregroundStyle(TappyColor.textPrimary)
            Text(key).font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Content panel

struct ProfileHubContentPanel: View {
    @ObservedObject var vm: ProfileHubViewModel
    let onOpenReview: (String) -> Void
    let onOpenPlace: (Favorite) -> Void
    let onCompose: () -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 3)

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(ProfileHubTab.allCases) { t in
                        Button { vm.tab = t } label: {
                            Text(t.titleKey).font(.system(size: 13, weight: .medium))
                                .foregroundStyle(vm.tab == t ? TappyColor.onPrimary : TappyColor.textPrimary)
                                .padding(.horizontal, 12).frame(minHeight: 34)
                                .background(Capsule().fill(vm.tab == t ? TappyColor.primary : TappyColor.surface))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(vm.tab == t ? .isSelected : [])
                        .accessibilityIdentifier("profile-tab-\(t.rawValue)")
                    }
                }
            }
            content
        }
        .padding(16)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
    }

    @ViewBuilder
    private var content: some View {
        switch vm.tab {
        case .posts: reviewGrid(vm.posts, badge: nil, openable: true, compose: true)
        case .restricted: reviewGrid(vm.restricted, badge: "profileHub.badge.restricted", openable: false, compose: false)
        case .hidden: reviewGrid(vm.hidden, badge: "profileHub.badge.hidden", openable: false, compose: false)
        case .shared: collectionGrid(vm.shared)
        case .saved: collectionGrid(vm.saved)
        case .places: placeList
        }
    }

    @ViewBuilder
    private func reviewGrid(_ rows: [Review]?, badge: LocalizedStringKey?, openable: Bool, compose: Bool) -> some View {
        if let rows {
            if rows.isEmpty {
                empty(compose: compose)
            } else {
                LazyVGrid(columns: columns, spacing: 4) {
                    ForEach(rows) { r in
                        let t = tile(thumb: ReviewPoster.url(photos: r.photos, thumbnail: r.thumbnail), body: r.body, video: r.contentType == "video", badge: badge)
                        if openable {
                            Button { onOpenReview(r.id) } label: { t }.buttonStyle(.plain)
                        } else {
                            t
                        }
                    }
                }
            }
        } else {
            loadingOrFailed
        }
    }

    @ViewBuilder
    private func collectionGrid(_ rows: [CollectionReview]?) -> some View {
        if let rows {
            if rows.isEmpty {
                empty(compose: false)
            } else {
                LazyVGrid(columns: columns, spacing: 4) {
                    ForEach(rows) { r in
                        Button { onOpenReview(r.id) } label: {
                            tile(thumb: ReviewPoster.url(photos: r.photos, thumbnail: r.thumbnail), body: r.body, video: r.isVideo, badge: nil)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        } else {
            loadingOrFailed
        }
    }

    @ViewBuilder
    private var placeList: some View {
        if let places = vm.places {
            if places.isEmpty {
                empty(compose: false)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(places.enumerated()), id: \.element.id) { i, p in
                        if i > 0 { Divider() }
                        Button { onOpenPlace(p) } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "mappin.and.ellipse").foregroundStyle(TappyColor.primary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.placeName).font(.system(size: 14, weight: .medium)).foregroundStyle(TappyColor.textPrimary).lineLimit(1)
                                    if !p.placeAddress.isEmpty {
                                        Text(p.placeAddress).font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary).lineLimit(1)
                                    }
                                }
                                Spacer()
                            }
                            .padding(.vertical, 10)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        } else {
            loadingOrFailed
        }
    }

    @ViewBuilder
    private var loadingOrFailed: some View {
        if vm.failed {
            Text("profileHub.loadFailed").font(.system(size: 13)).foregroundStyle(TappyColor.textSecondary)
                .frame(maxWidth: .infinity).padding(.vertical, 24)
        } else {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
        }
    }

    private func empty(compose: Bool) -> some View {
        VStack(spacing: 10) {
            Text(vm.tab.emptyKey).font(.system(size: 13)).foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
            if compose {
                Button(action: onCompose) {
                    Label("profileHub.compose", systemImage: "plus")
                        .font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 16).frame(minHeight: 38)
                        .background(Capsule().fill(TappyColor.primary))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("profile-compose")
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 24)
        .accessibilityIdentifier("profile-tab-empty")
    }

    private func tile(thumb: String?, body: String?, video: Bool, badge: LocalizedStringKey?) -> some View {
        // The cell's size comes from a clear 3:4 box; the photo is an overlay CLIPPED to it —
        // a fill-scaled image as the sizing view spilled across its neighbours (CI screenshot 16).
        Color.clear.aspectRatio(3.0 / 4.0, contentMode: .fit).overlay {
        ZStack(alignment: .topLeading) {
            Rectangle().fill(TappyColor.surface)
            if let thumb, let url = URL(string: thumb) {
                AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: { Color.clear }
            } else {
                Text(body ?? "").font(.system(size: 11)).foregroundStyle(TappyColor.textSecondary).lineLimit(4).padding(6)
            }
            if video {
                Image(systemName: "play.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                    .padding(6).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            }
            if let badge {
                // Hidden = the author's own choice (eye-off); restricted = the platform's hold.
                Color.black.opacity(0.45)
                Label(badge, systemImage: vm.tab == .hidden ? "eye.slash" : "exclamationmark.triangle.fill")
                    .font(.system(size: 10, weight: .semibold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        }
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Side panels (Android `ProfileInfoCard` / `ProfileStatsCard` / `ProfileQrCard`)

/// A titled card: header row (title + optional action), divider, body.
private struct HubPanel<Content: View>: View {
    let title: LocalizedStringKey
    var action: LocalizedStringKey? = nil
    var onAction: (() -> Void)? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(TappyColor.textPrimary)
                Spacer()
                if let action, let onAction {
                    Button(action, action: onAction).font(.system(size: 13, weight: .medium))
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            VStack(alignment: .leading, spacing: 10, content: content).padding(16)
        }
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
    }
}

private struct HubRow: View {
    let label: LocalizedStringKey
    let value: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label).font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
            Spacer(minLength: 0)
            Text(value).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(TappyColor.textPrimary).lineLimit(1)
        }
    }
}

struct ProfileInfoCard: View {
    let profile: UserProfile?
    let onEdit: () -> Void
    var body: some View {
        HubPanel(title: "profileHub.info.title", action: "profileHub.info.edit", onAction: onEdit) {
            HubRow(label: "profileHub.info.name",
                   value: (profile?.fullName).flatMap { $0.isEmpty ? nil : $0 } ?? NSLocalizedString("profile.fallbackName", comment: ""))
            if let email = profile?.email, !email.isEmpty {
                HubRow(label: "profileHub.info.email", value: email)
            }
        }
    }
}

/// "Thành tích": six real counts; a count not known yet shows "—", never a made-up 0.
struct ProfileStatsCard: View {
    @ObservedObject var vm: ProfileHubViewModel
    let conversations: Int?
    var body: some View {
        HubPanel(title: "profileHub.stats.title") {
            HubRow(label: "profileHub.stats.posts", value: text(vm.posts?.count))
            HubRow(label: "profileHub.stats.videos", value: text(vm.posts?.filter { $0.contentType == "video" }.count))
            HubRow(label: "profileHub.stat.likes", value: text(vm.likes))
            HubRow(label: "profileHub.stats.savedPosts", value: text(vm.saved?.count))
            HubRow(label: "profileHub.stats.savedPlaces", value: text(vm.places?.count))
            HubRow(label: "profileHub.stats.conversations", value: text(conversations))
        }
    }
    private func text(_ n: Int?) -> String { n.map(String.init) ?? "—" }
}

struct ProfileQrCard: View {
    let onShowQr: () -> Void
    var body: some View {
        HubPanel(title: "profileHub.qr.title") {
            HStack(spacing: 12) {
                Text("profileHub.qr.hint").font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
                Spacer()
                Button(action: onShowQr) {
                    Label("profileHub.qr.title", systemImage: "qrcode")
                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(TappyColor.primary)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .overlay(Capsule().stroke(TappyColor.primary, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Following preview

struct ProfileFollowingCard: View {
    let following: [UserSearchResult]?
    let onOpen: (String) -> Void
    let onSeeAll: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("profileHub.following").font(.system(size: 15, weight: .bold)).foregroundStyle(TappyColor.textPrimary)
                Spacer()
                Button("profileHub.seeAll", action: onSeeAll).font(.system(size: 13, weight: .medium))
            }
            if let following {
                if following.isEmpty {
                    Text("profileHub.followingEmpty").font(.system(size: 13)).foregroundStyle(TappyColor.textSecondary)
                } else {
                    ForEach(following) { u in
                        Button { onOpen(u.id) } label: {
                            HStack(spacing: 10) {
                                Text(String(u.displayName.prefix(1)).uppercased())
                                    .font(.system(size: 14, weight: .bold)).foregroundStyle(TappyColor.primary)
                                    .frame(width: 36, height: 36).background(Circle().fill(TappyColor.surface))
                                Text(u.displayName).font(.system(size: 14, weight: .medium)).foregroundStyle(TappyColor.textPrimary)
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
    }
}
