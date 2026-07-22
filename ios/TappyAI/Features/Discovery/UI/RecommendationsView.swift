import SwiftUI

struct RecommendationsView: View {
    let deps: AppDependencies
    @EnvironmentObject private var router: AppRouter

    @State private var recs: [Recommendation] = []
    @State private var explanation: [String] = []
    @State private var personalized = false
    @State private var loading = true
    @State private var error: String?

    private var placesService: PlacesService { PlacesService(api: deps.api) }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                subtitle
                if loading { loadingState }
                else if let error { errorCard(error) }
                else if recs.isEmpty { emptyState }
                else {
                    explanationTags
                    recsList
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("✨ Gợi ý cho bạn")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadRecommendations() }
    }

    // MARK: - Subtitle

    private var subtitle: some View {
        HStack(spacing: Spacing.xs) {
            Image(systemName: "sparkles")
                .font(.system(size: 13))
                .foregroundStyle(TappyColor.primary)
            Text(personalized ? "Cá nhân hóa theo sở thích của bạn" : "Địa điểm nổi bật gần đây")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Loading

    private var loadingState: some View {
        ProgressView()
            .frame(maxWidth: .infinity)
            .padding(.top, 60)
    }

    // MARK: - Error

    private func errorCard(_ message: String) -> some View {
        Text(message)
            .font(TappyFont.callout)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity)
            .padding(Spacing.md)
            .background(Color.red.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(Color.red.opacity(0.2), lineWidth: 1)
            )
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Text("🤖")
                .font(.system(size: 48))
            Text("Chưa đủ dữ liệu để gợi ý.")
                .font(.system(size: 14))
                .foregroundStyle(TappyColor.textSecondary)
            Text("Dùng Tappy nhiều hơn (chat, lưu địa điểm, review) để Tappy hiểu bạn rõ hơn nhé!")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.lg)
        }
        .padding(.top, 40)
    }

    // MARK: - Explanation tags

    private var explanationTags: some View {
        Group {
            if !explanation.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.xs) {
                        ForEach(explanation, id: \.self) { tag in
                            Text(tag)
                                .font(.system(size: 11))
                                .padding(.horizontal, Spacing.sm)
                                .padding(.vertical, 4)
                                .background(TappyColor.primary.opacity(0.08))
                                .foregroundStyle(TappyColor.primary)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
        }
    }

    // MARK: - Recs list

    private var recsList: some View {
        ForEach(Array(recs.enumerated()), id: \.element.id) { index, rec in
            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack(alignment: .top, spacing: Spacing.md) {
                    Text("\(index + 1)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(
                            LinearGradient(
                                colors: [TappyColor.primary, TappyColor.primary.opacity(0.7)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                        .clipShape(Circle())

                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text(rec.placeName.isEmpty ? "Địa điểm" : rec.placeName)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(TappyColor.textPrimary)

                        if !rec.matchedSignals.isEmpty {
                            HStack(spacing: 4) {
                                ForEach(Array(rec.matchedSignals.prefix(4)), id: \.self) { s in
                                    Text(s)
                                        .font(.system(size: 10))
                                        .padding(.horizontal, Spacing.xs)
                                        .padding(.vertical, 2)
                                        .background(TappyColor.surface)
                                        .foregroundStyle(TappyColor.textSecondary)
                                        .clipShape(Capsule())
                                }
                            }
                        }

                        Button {
                            let q = "Kể mình nghe về \(rec.placeName.isEmpty ? "địa điểm này" : rec.placeName)"
                            router.popToRoot(on: .chat)
                            router.switchTo(.chat)
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "bubble.left.fill")
                                    .font(.system(size: 10))
                                Text("Hỏi Tappy về chỗ này")
                                    .font(.system(size: 11, weight: .medium))
                            }
                            .foregroundStyle(TappyColor.primary)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 2)
                    }
                }
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

    // MARK: - Load

    private func loadRecommendations() async {
        do {
            let response = try await placesService.fetchRecommendations()
            recs = response.recommendations
            explanation = response.explanation ?? []
            personalized = response.personalized ?? false
        } catch let err as AppError {
            if case .authentication = err {
                error = "Cần đăng nhập để xem gợi ý."
            } else {
                error = "Không tải được gợi ý, thử lại nhé."
            }
        } catch {
            self.error = "Không tải được gợi ý, thử lại nhé."
        }
        loading = false
    }
}
