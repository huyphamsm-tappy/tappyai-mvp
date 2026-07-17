import SwiftUI

struct TarotView: View {
    @State private var cardCount = 3
    @State private var drawnCards: [DrawnCard] = []
    @State private var isRevealed = false

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                if drawnCards.isEmpty {
                    setupSection
                } else {
                    resultSection
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("🔮 Bói bài Tarot")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Setup

    private var setupSection: some View {
        VStack(spacing: Spacing.lg) {
            VStack(spacing: Spacing.sm) {
                Text("🔮")
                    .font(.system(size: 56))
                Text("Chọn số lá bài để rút")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(TappyColor.textPrimary)
                Text("Tập trung vào câu hỏi của bạn, sau đó rút bài")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
                    .multilineTextAlignment(.center)
            }

            HStack(spacing: Spacing.sm) {
                ForEach([1, 2, 3], id: \.self) { count in
                    Button {
                        cardCount = count
                    } label: {
                        Text("\(count) lá")
                            .font(.system(size: 14, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.sm)
                            .background(cardCount == count ? TappyColor.primary : TappyColor.surface)
                            .foregroundStyle(cardCount == count ? .white : TappyColor.textSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Spacing.xl)

            Button {
                withAnimation(.spring(response: 0.5)) {
                    drawnCards = TarotDeck.getRandomCards(count: cardCount)
                    isRevealed = true
                }
            } label: {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "sparkles")
                    Text("Rút bài")
                }
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    LinearGradient(
                        colors: [.purple, TappyColor.accent],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, Spacing.xl)
        }
        .padding(.vertical, Spacing.xxl)
    }

    // MARK: - Result

    private var resultSection: some View {
        VStack(spacing: Spacing.lg) {
            ForEach(Array(drawnCards.enumerated()), id: \.element.id) { idx, drawn in
                cardResultView(drawn, position: idx + 1)
            }

            Button {
                withAnimation {
                    drawnCards = []
                    isRevealed = false
                }
            } label: {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "arrow.counterclockwise")
                    Text("Rút lại")
                }
                .font(.system(size: 14, weight: .medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(TappyColor.surface)
                .foregroundStyle(TappyColor.textPrimary)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.lg)
                        .stroke(TappyColor.border, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)

            Text("Kết quả mang tính giải trí, không thay thế tư vấn chuyên nghiệp")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
        }
    }

    private func cardResultView(_ drawn: DrawnCard, position: Int) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Text(drawn.card.emoji)
                    .font(.system(size: 32))
                VStack(alignment: .leading, spacing: 2) {
                    if drawnCards.count > 1 {
                        Text("Lá \(position)")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    Text(drawn.card.nameVi)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("\(drawn.card.name) • \(drawn.positionLabel)")
                        .font(TappyFont.caption)
                        .foregroundStyle(drawn.reversed ? .orange : TappyColor.primary)
                }
                Spacer()
            }

            FlowLayout(spacing: Spacing.xs) {
                ForEach(drawn.displayKeywords, id: \.self) { kw in
                    Text(kw)
                        .font(.system(size: 11, weight: .medium))
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 3)
                        .background(TappyColor.primary.opacity(0.1))
                        .foregroundStyle(TappyColor.primary)
                        .clipShape(Capsule())
                }
            }

            Text(drawn.displayMeaning)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }
}
