import SwiftUI

struct FavoritesView: View {
    let deps: AppDependencies
    @EnvironmentObject private var router: AppRouter

    @State private var favorites: [Favorite] = []
    @State private var savedReviews: [SavedReview] = []
    @State private var loading = true
    @State private var error = false

    private var placesService: PlacesService { PlacesService(api: deps.api) }
    private var total: Int { favorites.count + savedReviews.count }

    private let typeEmoji: [String: String] = [
        "food": "🍜", "spa": "💆", "hotel": "🏨", "travel": "✈️",
        "shopping": "🛍️", "entertainment": "🎉", "cafe": "☕",
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                if loading {
                    ForEach(0..<3, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: Radius.xl)
                            .fill(TappyColor.cardBackground)
                            .frame(height: 72)
                    }
                    .redacted(reason: .placeholder)
                } else if error {
                    errorState
                } else if total == 0 {
                    emptyState
                } else {
                    if !favorites.isEmpty { favoritesSection }
                    if !savedReviews.isEmpty { savedReviewsSection }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Đã lưu")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Text("♡")
                .font(.system(size: 48))
            Text("Chưa lưu gì cả")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text("Bấm ♡ để lưu địa điểm yêu thích, hoặc 🔖 để lưu bài viết muốn xem lại — tất cả sẽ nằm ở đây.")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.lg)

            Button {
                router.popToRoot(on: .home)
                router.switchTo(.home)
            } label: {
                HStack(spacing: Spacing.xs) {
                    Text("Khám phá ngay")
                        .font(.system(size: 13, weight: .semibold))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12))
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, 10)
                .background(TappyColor.primary)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            }
            .buttonStyle(.plain)
        }
        .padding(.top, Spacing.xl)
    }

    // MARK: - Error state

    private var errorState: some View {
        VStack(spacing: Spacing.sm) {
            Text("Không tải được mục đã lưu")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)
            Text("Vui lòng thử lại sau nhé.")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
        }
        .padding(.top, Spacing.xl)
    }

    // MARK: - Favorites section

    private var favoritesSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: Spacing.xs) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(.red)
                Text("ĐỊA ĐIỂM YÊU THÍCH")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .padding(.horizontal, 2)

            ForEach(favorites) { f in
                HStack(spacing: Spacing.md) {
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
                        HStack(spacing: Spacing.md) {
                            Text(typeEmoji[f.placeType] ?? "📍")
                                .font(.system(size: 24))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(f.placeName)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(TappyColor.textPrimary)
                                    .lineLimit(1)
                                if !f.placeAddress.isEmpty {
                                    Text(f.placeAddress)
                                        .font(TappyFont.caption)
                                        .foregroundStyle(TappyColor.textSecondary)
                                        .lineLimit(1)
                                }
                                Text("Đã lưu \(formatDate(f.createdAt))")
                                    .font(.system(size: 10))
                                    .foregroundStyle(TappyColor.textSecondary.opacity(0.6))
                            }
                            Spacer()
                        }
                        .padding(Spacing.md)
                    }
                    .buttonStyle(.plain)

                    Button {
                        Task { await deleteFavorite(f.placeId) }
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 14))
                            .foregroundStyle(TappyColor.textSecondary)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, Spacing.sm)
                }
                .background(TappyColor.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.xl)
                        .stroke(TappyColor.border, lineWidth: 1)
                )
            }
        }
    }

    // MARK: - Saved reviews section

    private var savedReviewsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: Spacing.xs) {
                Image(systemName: "bookmark.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(TappyColor.primary)
                Text("BÀI VIẾT ĐÃ LƯU")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .padding(.horizontal, 2)

            ForEach(savedReviews) { s in
                HStack(spacing: Spacing.md) {
                    if let thumb = s.thumbnail ?? s.photos?.first, let url = URL(string: thumb) {
                        AsyncImage(url: url) { img in
                            img.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Color.gray.opacity(0.2)
                        }
                        .frame(width: 48, height: 48)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    } else {
                        Text("📝")
                            .font(.system(size: 20))
                            .frame(width: 48, height: 48)
                            .background(TappyColor.primary.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.placeName ?? "Bài viết")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(TappyColor.textPrimary)
                            .lineLimit(1)
                        if let body = s.body, !body.isEmpty {
                            Text(body)
                                .font(TappyFont.caption)
                                .foregroundStyle(TappyColor.textSecondary)
                                .lineLimit(2)
                        }
                        Text("Đã lưu \(formatDate(s.savedAt))")
                            .font(.system(size: 10))
                            .foregroundStyle(TappyColor.textSecondary.opacity(0.6))
                    }
                    Spacer()
                }
                .padding(Spacing.md)
                .background(TappyColor.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.xl)
                        .stroke(TappyColor.border, lineWidth: 1)
                )
            }
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
