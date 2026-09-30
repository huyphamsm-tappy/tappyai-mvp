import SwiftUI

/// Saved — the web `/profile/favorites` (`SavedView.tsx`), mockup Sep 28 02_06, Android `SavedScreen`.
///
/// The hero carries the filter chips Tất cả / Địa điểm / Bài viết / Video (Deals and Bộ sưu tập are
/// HIDDEN — no save model behind them). "Tất cả" is the hub: two count cards, one per REAL saved
/// dataset (`/api/favorites`, `/api/reviews/saved`) and, when nothing is saved, one empty card whose
/// CTA opens Explore. Video is a FILTER over the saved posts. ZERO IS SHOWN, NOT HIDDEN.
struct FavoritesView: View {
    enum Filter: String, CaseIterable, Identifiable {
        case all, places, posts, videos
        var id: String { rawValue }
        var labelKey: LocalizedStringKey {
            switch self {
            case .all: return "saved.filter.all"
            case .places: return "saved.filter.places"
            case .posts: return "saved.filter.posts"
            case .videos: return "saved.filter.videos"
            }
        }
        var icon: String {
            switch self {
            case .all: return "square.grid.2x2"
            case .places: return "mappin.and.ellipse"
            case .posts: return "doc.text"
            case .videos: return "play.circle"
            }
        }
    }

    let deps: AppDependencies
    @EnvironmentObject private var router: AppRouter

    @State private var favorites: [Favorite] = []
    @State private var savedReviews: [SavedReview] = []
    @State private var loading = true
    @State private var error = false
    @State private var filter: Filter = .all

    private var placesService: PlacesService { PlacesService(api: deps.api) }
    private var total: Int { favorites.count + savedReviews.count }
    private let accent = Color(hex: 0x3391FF)

    private let typeEmoji: [String: String] = [
        "food": "🍜", "spa": "💆", "hotel": "🏨", "travel": "✈️",
        "shopping": "🛍️", "entertainment": "🎉", "cafe": "☕",
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                hero
                if loading {
                    ForEach(0..<2, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: Radius.xl)
                            .fill(TappyColor.cardBackground)
                            .frame(height: 104)
                    }
                    .redacted(reason: .placeholder)
                } else if error {
                    errorState
                } else {
                    switch filter {
                    case .all:
                        hub
                        if total == 0 { emptyCard }
                    case .places:
                        categoryPanel(title: "saved.section.places", empty: favorites.isEmpty) { favoriteRows }
                    case .posts:
                        categoryPanel(title: "saved.section.posts", empty: savedReviews.isEmpty) { reviewRows(savedReviews) }
                    case .videos:
                        let videos = savedReviews.filter { $0.contentType == "video" }
                        categoryPanel(title: "saved.section.videos", empty: videos.isEmpty) { reviewRows(videos) }
                    }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("saved.title")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
    }

    // MARK: - Hero

    private var hero: some View {
        ZStack(alignment: .topTrailing) {
            Image("TappyReading")
                .resizable().scaledToFit()
                .frame(width: 96, height: 96)
                .padding(.top, 8).padding(.trailing, 4)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "bookmark.fill").font(.system(size: 15)).foregroundStyle(accent)
                    Text("saved.title").font(.system(size: 15, weight: .bold)).foregroundStyle(accent)
                }
                Text("saved.hero.title")
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundStyle(TappyColor.textPrimary)
                    .padding(.trailing, 88)
                Text("saved.hero.subtitle")
                    .font(.system(size: 13.5))
                    .foregroundStyle(TappyColor.textSecondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(Filter.allCases) { chip in chipView(chip) }
                    }
                }
                .padding(.top, 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .background(
            LinearGradient(colors: [accent.opacity(0.18), TappyColor.cardBackground],
                           startPoint: .topTrailing, endPoint: .bottomLeading)
        )
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityIdentifier("saved-hero")
    }

    private func chipView(_ chip: Filter) -> some View {
        let active = chip == filter
        return Button { filter = chip } label: {
            HStack(spacing: 6) {
                Image(systemName: chip.icon).font(.system(size: 13))
                Text(chip.labelKey).font(.system(size: 13, weight: .medium))
            }
            .foregroundStyle(active ? TappyColor.textPrimary : TappyColor.textSecondary)
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(active ? accent.opacity(0.12) : Color.clear)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(active ? accent : Color.clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
        .accessibilityIdentifier("saved-chip-\(chip.rawValue)")
    }

    // MARK: - Hub (two count cards)

    private var hub: some View {
        VStack(spacing: 12) {
            countCard(.places, icon: "mappin.and.ellipse", tile: Color(hex: 0x1D6FE0),
                      label: "saved.section.places", desc: "saved.card.places.desc",
                      count: favorites.count, unit: "saved.unit.places")
            countCard(.posts, icon: "doc.text", tile: Color(hex: 0x6D4FD8),
                      label: "saved.section.posts", desc: "saved.card.posts.desc",
                      count: savedReviews.count, unit: "saved.unit.posts")
        }
    }

    private func countCard(_ target: Filter, icon: String, tile: Color, label: LocalizedStringKey,
                           desc: LocalizedStringKey, count: Int, unit: LocalizedStringKey) -> some View {
        Button { filter = target } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20)).foregroundStyle(.white)
                    .frame(width: 48, height: 48).background(tile).clipShape(Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text(label).font(.system(size: 16, weight: .bold)).foregroundStyle(TappyColor.textPrimary).lineLimit(1)
                    Text(desc).font(.system(size: 12.5)).foregroundStyle(TappyColor.textSecondary)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                VStack(spacing: 0) {
                    Text("\(count)").font(.system(size: 28, weight: .heavy)).foregroundStyle(TappyColor.textPrimary)
                    Text(unit).font(.system(size: 12.5)).foregroundStyle(TappyColor.textSecondary)
                }
                Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
            }
            .padding(16)
            .frame(minHeight: 104)
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("saved-count-\(target.rawValue)")
    }

    // MARK: - Empty (nothing saved at all)

    private var emptyCard: some View {
        VStack(spacing: 0) {
            Image(systemName: "bookmark.fill")
                .font(.system(size: 34)).foregroundStyle(accent)
                .frame(width: 80, height: 80)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            Text("saved.hubEmpty.title").font(.system(size: 20, weight: .bold))
                .foregroundStyle(TappyColor.textPrimary).padding(.top, 20)
            Text("saved.hubEmpty.hint").font(.system(size: 13.5)).foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center).padding(.top, 8)
            exploreButton.padding(.top, 24)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24).padding(.horizontal, Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityIdentifier("saved-empty")
    }

    private var exploreButton: some View {
        Button { router.switchTo(.explore) } label: {
            HStack(spacing: 8) {
                Image(systemName: "safari").font(.system(size: 16))
                Text("saved.exploreNow").font(.system(size: 15, weight: .semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 28).frame(minHeight: 48)
            .background(accent).clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("saved-explore-now")
    }

    // MARK: - Error

    private var errorState: some View {
        VStack(spacing: Spacing.sm) {
            Text("saved.error.title")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text("saved.error.detail")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
        }
        .padding(.top, Spacing.xl)
    }

    // MARK: - Category panel

    private func categoryPanel<Rows: View>(title: LocalizedStringKey, empty: Bool,
                                           @ViewBuilder rows: () -> Rows) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button { filter = .all } label: {
                    Text("‹ ") + Text("saved.title")
                }
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color(hex: 0x8B5CF6))
                .buttonStyle(.plain)
                Text(title).font(.system(size: 14, weight: .bold)).foregroundStyle(TappyColor.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            Divider()
            if empty {
                VStack(spacing: 6) {
                    Text("saved.empty.title").font(.system(size: 13, weight: .medium))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("saved.empty.detail").font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
                        .multilineTextAlignment(.center)
                    Button { router.switchTo(.explore) } label: {
                        Text("saved.exploreNow").font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x8B5CF6))
                    }
                    .buttonStyle(.plain).padding(.top, 6)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24).padding(.vertical, 40)
            } else {
                rows()
            }
        }
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
    }

    // MARK: - Rows

    private var favoriteRows: some View {
        ForEach(Array(favorites.enumerated()), id: \.element.id) { index, f in
            if index > 0 { Divider() }
            HStack(spacing: 8) {
                Button {
                    let detail = ServiceDetail(
                        id: buildSlug(f.placeName),
                        name: f.placeName,
                        address: f.placeAddress,
                        type: f.placeType,
                        phone: "", price: "", rating: "", hours: "",
                        mapsLink: "", note: "",
                        placeId: f.placeId
                    )
                    router.push(HomeDestination.serviceDetail(detail), on: .home)
                } label: {
                    HStack(spacing: 12) {
                        Text(typeEmoji[f.placeType] ?? "📍").font(.system(size: 20))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(f.placeName).font(.system(size: 13, weight: .medium))
                                .foregroundStyle(TappyColor.textPrimary).lineLimit(1)
                            if !f.placeAddress.isEmpty {
                                Text(f.placeAddress).font(.system(size: 11.5))
                                    .foregroundStyle(TappyColor.textSecondary).lineLimit(1)
                            }
                            Text(savedOn(f.createdAt)).font(.system(size: 11))
                                .foregroundStyle(TappyColor.textSecondary).padding(.top, 2)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                }
                .buttonStyle(.plain)
                Button { Task { await deleteFavorite(f.placeId) } } label: {
                    Image(systemName: "trash").font(.system(size: 14))
                        .foregroundStyle(TappyColor.textSecondary).frame(width: 40, height: 40)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("saved.remove"))
                .padding(.trailing, 8)
            }
        }
    }

    private func reviewRows(_ items: [SavedReview]) -> some View {
        ForEach(Array(items.enumerated()), id: \.element.id) { index, s in
            if index > 0 { Divider() }
            Button { router.push(ReviewsDestination.reviewDetail(id: s.id), on: .profile) } label: {
                HStack(spacing: 12) {
                    if let thumb = s.thumbnail ?? s.photos?.first, let url = URL(string: thumb) {
                        AsyncImage(url: url) { img in
                            img.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Color.gray.opacity(0.2)
                        }
                        .frame(width: 48, height: 48)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    } else {
                        Image(systemName: "doc.text").font(.system(size: 17))
                            .foregroundStyle(Color(hex: 0x8B5CF6))
                            .frame(width: 48, height: 48)
                            .background(TappyColor.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.placeName ?? NSLocalizedString("saved.post.fallbackTitle", comment: ""))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(TappyColor.textPrimary).lineLimit(1)
                        if let body = s.body, !body.isEmpty {
                            Text(body).font(.system(size: 11.5)).foregroundStyle(TappyColor.textSecondary).lineLimit(2)
                        }
                        Text(savedOn(s.savedAt)).font(.system(size: 11))
                            .foregroundStyle(TappyColor.textSecondary).padding(.top, 2)
                    }
                    Spacer(minLength: 0)
                }
                .padding(12)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Helpers

    private func loadData() async {
        do {
            async let favsTask = placesService.fetchFavorites()
            async let savedTask = placesService.fetchSavedReviews()
            let (favs, saved) = try await (favsTask, savedTask)
            favorites = favs
            savedReviews = saved
        } catch {
            self.error = true
        }
        loading = false
    }

    private func deleteFavorite(_ placeId: String) async {
        guard let idx = favorites.firstIndex(where: { $0.placeId == placeId }) else { return }
        let removed = favorites[idx]
        favorites.remove(at: idx)
        do {
            try await placesService.deletePlace(placeId: placeId)
        } catch {
            favorites.insert(removed, at: min(idx, favorites.count))
        }
    }

    private func savedOn(_ iso: String) -> String {
        String(format: NSLocalizedString("saved.datePrefix", comment: ""), formatDate(iso))
    }

    private func formatDate(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
        let df = DateFormatter()
        df.locale = Locale(identifier: "vi_VN")
        df.dateFormat = "dd/MM/yyyy"
        return df.string(from: date)
    }

    private func buildSlug(_ name: String) -> String {
        let slug = name.lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .components(separatedBy: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-")).inverted)
            .joined()
        return String(slug.prefix(40).isEmpty ? "place" : slug.prefix(40))
    }
}
