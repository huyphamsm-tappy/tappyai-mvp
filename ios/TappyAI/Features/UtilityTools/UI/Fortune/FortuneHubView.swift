import SwiftUI

struct FortuneHubView: View {
    let deps: AppDependencies

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                heroBanner
                featureList
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("🔮 Bói toán")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: FortuneDestination.self) { dest in
            switch dest {
            case .tarot:
                TarotView()
            case .tuVi:
                TuViView()
            case .zodiac:
                ZodiacView()
            }
        }
    }

    // MARK: - Hero banner

    private var heroBanner: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Tâm linh & Vận mệnh")
                .font(TappyFont.callout)
                .foregroundStyle(.white.opacity(0.8))
            Text("Khám phá vận số\ncủa bạn")
                .font(.system(size: 24, weight: .black))
                .foregroundStyle(.white)
            Text("Bói bài Tarot, Tử vi và Cung hoàng đạo — 100% offline, miễn phí")
                .font(TappyFont.callout)
                .foregroundStyle(.white.opacity(0.8))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.xl)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 79/255, green: 70/255, blue: 229/255),
                    Color(red: 147/255, green: 51/255, blue: 234/255),
                    TappyColor.accent
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
    }

    // MARK: - Feature list

    private var featureList: some View {
        VStack(spacing: Spacing.sm) {
            featureLink(emoji: "🔮", title: "Bói bài Tarot", desc: "Rút 1–3 lá bài, nhận thông điệp từ vũ trụ", gradient: [.purple.opacity(0.15), .purple.opacity(0.05)], destination: .tarot)
            featureLink(emoji: "🧧", title: "Tử vi", desc: "Xem vận hạn theo tuổi Can Chi, Ngũ Hành", gradient: [.orange.opacity(0.15), .orange.opacity(0.05)], destination: .tuVi)
            featureLink(emoji: "✨", title: "Cung hoàng đạo", desc: "Luận giải theo 12 chòm sao phương Tây", gradient: [Color(red: 0.2, green: 0.6, blue: 0.9).opacity(0.15), Color(red: 0.2, green: 0.6, blue: 0.9).opacity(0.05)], destination: .zodiac)
        }
    }

    private func featureLink(emoji: String, title: String, desc: String, gradient: [Color], destination: FortuneDestination) -> some View {
        NavigationLink(value: destination) {
            HStack(spacing: Spacing.md) {
                Text(emoji)
                    .font(.system(size: 28))
                    .frame(width: 56, height: 56)
                    .background(TappyColor.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text(desc)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .foregroundStyle(TappyColor.textSecondary.opacity(0.5))
            }
            .padding(Spacing.md)
            .background(
                LinearGradient(colors: gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
            )
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.xl)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Navigation

enum FortuneDestination: Hashable {
    case tarot, tuVi, zodiac
}
