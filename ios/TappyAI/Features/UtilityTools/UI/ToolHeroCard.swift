import SwiftUI

/// The hero every Web tool page opens with (`translate`, `currency`, `split-bill`, `scan`, `boi`, `viet-content`): an eyebrow, a two-line
/// title, a sentence, optional chips and the tool's mascot, on the blue→indigo→violet gradient `VietContentView` already drew. The tool
/// screens other than Writing and Scam Shield went straight to their form (UAT build 129: «layout not like the Web»).
struct ToolHeroCard: View {
    let eyebrow: String
    let title: [String]
    let subtitle: String?
    var chips: [String] = []
    let mascot: String
    var identifier = "tool-hero"

    private static let gradient = LinearGradient(
        colors: [Color(hex: 0x001833), Color(hex: 0x3730A3), Color(hex: 0x7C3AED)],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                if !eyebrow.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles").font(.system(size: 14)).foregroundStyle(Color(hex: 0x66ACFF))
                        Text(eyebrow).font(.system(size: 14, weight: .semibold)).foregroundStyle(Color(hex: 0x99C8FF))
                    }
                }
                if !title.isEmpty {
                    Text(title.joined(separator: "\n"))
                        .font(.system(size: 22, weight: .black)).foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(.system(size: 14)).foregroundStyle(.white.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !chips.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(chips, id: \.self) { chip in
                            Text(chip).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
                                .lineLimit(1).minimumScaleFactor(0.7)
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(.white.opacity(0.14)).clipShape(Capsule())
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(mascot).resizable().scaledToFit().frame(width: 96, height: 96).accessibilityHidden(true)
        }
        .padding(20)
        .background(Self.gradient)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(.white.opacity(0.1), lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

/// A big tappable card with an icon, a title, a line and a call to action (Web scan page: «Chụp ảnh tài liệu» / «Chọn ảnh từ thư viện»).
struct ToolActionCard: View {
    let symbol: String
    let tint: Color
    let title: String
    let detail: String
    let cta: String
    let identifier: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Image(systemName: symbol).font(.system(size: 26, weight: .semibold)).foregroundStyle(tint)
                    .frame(width: 52, height: 52).background(tint.opacity(0.14)).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text(title).font(.system(size: 18, weight: .heavy)).foregroundStyle(TappyColor.textPrimary).multilineTextAlignment(.leading)
                Text(detail).font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary).multilineTextAlignment(.leading)
                HStack(spacing: 8) {
                    Image(systemName: symbol)
                    Text(cta).font(.system(size: 15, weight: .bold))
                }
                .foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 12).background(tint)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)).padding(.top, Spacing.xs)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(TappyColor.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }
}

/// A titled card of short rows (Web `v3-scan-card`: «Định dạng hỗ trợ», «Mẹo để có kết quả tốt hơn»).
struct ToolInfoCard: View {
    let title: String
    var detail: String? = nil
    var rows: [(symbol: String, title: String, detail: String)] = []
    var note: String? = nil
    /// Small format chips under the detail (Web `v3-scan-fmt`: JPG / PNG / WEBP).
    var badges: [String] = []
    var identifier = "tool-info"

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(title).font(.system(size: 16, weight: .bold)).foregroundStyle(TappyColor.textPrimary)
            if let detail { Text(detail).font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary) }
            if !badges.isEmpty {
                HStack(spacing: 6) {
                    ForEach(badges, id: \.self) { badge in
                        Text(badge).font(.system(size: 11, weight: .bold)).foregroundStyle(TappyColor.primary)
                            .padding(.horizontal, 10).padding(.vertical, 4)
                            .background(TappyColor.primary.opacity(0.12)).clipShape(Capsule())
                    }
                }
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(alignment: .top, spacing: Spacing.sm) {
                    Image(systemName: row.symbol).font(.system(size: 18, weight: .semibold)).foregroundStyle(TappyColor.primary)
                        .frame(width: 36, height: 36).background(TappyColor.primary.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.title).font(.system(size: 14.5, weight: .bold)).foregroundStyle(TappyColor.textPrimary)
                        Text(row.detail).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                    }
                }
            }
            if let note { Text(note).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary).padding(.top, Spacing.xxs) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityIdentifier(identifier)
    }
}
