import SwiftUI

struct ZodiacView: View {
    @State private var selectedSign: ZodiacSign?
    @State private var period: FortunePeriod = .day
    @State private var reading: FortuneReading?

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                signGrid
                if let sign = selectedSign {
                    periodPicker
                    signProfile(sign)
                    if let reading {
                        readingSection(reading)
                    }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("✨ Cung hoàng đạo")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Sign grid

    private var signGrid: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Chọn cung của bạn")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Spacing.xs), count: 4), spacing: Spacing.xs) {
                ForEach(ZodiacData.signs) { sign in
                    Button {
                        selectedSign = sign
                        generateReading(sign: sign)
                    } label: {
                        VStack(spacing: 4) {
                            Text(sign.emoji)
                                .font(.system(size: 24))
                            Text(sign.nameVi)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(selectedSign?.id == sign.id ? .white : TappyColor.textSecondary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                        .background(selectedSign?.id == sign.id ? TappyColor.primary : TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Period picker

    private var periodPicker: some View {
        HStack(spacing: Spacing.xs) {
            ForEach(FortunePeriod.allCases, id: \.self) { p in
                Button {
                    period = p
                    if let sign = selectedSign {
                        generateReading(sign: sign)
                    }
                } label: {
                    Text(p.label)
                        .font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                        .background(period == p ? TappyColor.primary : TappyColor.surface)
                        .foregroundStyle(period == p ? .white : TappyColor.textSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Sign profile

    private func signProfile(_ sign: ZodiacSign) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                Text(sign.emoji)
                    .font(.system(size: 36))
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(sign.nameVi) (\(sign.nameEn))")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("\(sign.dateRangeLabel) • \(sign.element) • \(sign.ruling)")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }

            Text(sign.traits)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Reading

    private func readingSection(_ r: FortuneReading) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack {
                Text("Vận hạn: \(r.periodLabel)")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)
                Spacer()
                HStack(spacing: 2) {
                    ForEach(1...5, id: \.self) { i in
                        Image(systemName: i <= r.score ? "star.fill" : "star")
                            .font(.system(size: 12))
                            .foregroundStyle(i <= r.score ? .orange : TappyColor.textSecondary.opacity(0.3))
                    }
                }
            }

            fortuneRow(emoji: "💕", label: "Tình cảm", text: r.love)
            fortuneRow(emoji: "💼", label: "Sự nghiệp", text: r.career)
            fortuneRow(emoji: "💰", label: "Tài lộc", text: r.money)
            fortuneRow(emoji: "🏥", label: "Sức khoẻ", text: r.health)

            Divider()

            HStack(spacing: Spacing.lg) {
                VStack(spacing: 2) {
                    Text("Số may")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    Text("\(r.luckyNumber)")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(TappyColor.primary)
                }
                VStack(spacing: 2) {
                    Text("Màu may")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    Text(r.luckyColor)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(TappyColor.primary)
                }
            }

            Text("Kết quả mang tính giải trí, không thay thế tư vấn chuyên nghiệp")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    private func fortuneRow(emoji: String, label: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            HStack(spacing: Spacing.xs) {
                Text(emoji)
                    .font(.system(size: 14))
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textPrimary)
            }
            Text(text)
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
        }
    }

    // MARK: - Helpers

    private func generateReading(sign: ZodiacSign) {
        reading = FortuneEngine.generateFortune(subjectId: sign.id, period: period, banks: sign.banks)
    }
}
