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
                HStack(spacing: 6) {
                    Image(systemName: "sparkles").font(.system(size: 14)).foregroundStyle(Color(hex: 0x66ACFF))
                    Text(eyebrow).font(.system(size: 14, weight: .semibold)).foregroundStyle(Color(hex: 0x99C8FF))
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
