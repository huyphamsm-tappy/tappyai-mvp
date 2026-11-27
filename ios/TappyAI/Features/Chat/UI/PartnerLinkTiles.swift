import SwiftUI

/// The partner links of an answer as tiles (owner UAT 27/11: «liệt kê ô ra để user click vào đặt hàng»): one tile per link, the partner in the
/// owner's order (a bus or train ticket from Vexere first, rooms from Agoda, shopping from Lazada), then the other platforms «Tham khảo thêm» as
/// small chips. A tile is a link: a tap opens the partner's page. The label and the address are the server's own, nothing is composed here.
struct PartnerLinkTiles: View {
    let partners: [PartnerLink]
    let more: [PartnerLink]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            if !partners.isEmpty {
                Text(verbatim: LocalizationManager.currentLanguageCode == "en" ? "Book with our partners" : "Đặt qua đối tác")
                    .font(TappyFont.footnote.weight(.semibold))
                    .foregroundStyle(AnswerStyle.secondary)
                    .accessibilityAddTraits(.isHeader)
                ForEach(partners) { link in tile(link) }
            }
            if !more.isEmpty {
                Text(verbatim: LocalizationManager.currentLanguageCode == "en" ? "More options" : "Tham khảo thêm")
                    .font(TappyFont.footnote.weight(.semibold))
                    .foregroundStyle(AnswerStyle.secondary)
                    .padding(.top, partners.isEmpty ? 0 : Spacing.xxs)
                ChatFlowLayout(spacing: Spacing.xs) {
                    ForEach(more) { link in
                        if let url = safeWebURL(link.url) {
                            Link(destination: url) { AnswerChip(text: link.title, symbol: "arrow.up.right") }
                        }
                    }
                }
            }
        }
        .accessibilityIdentifier("partner-link-tiles")
    }

    @ViewBuilder
    private func tile(_ link: PartnerLink) -> some View {
        if let url = safeWebURL(link.url) {
            Link(destination: url) {
                HStack(alignment: .center, spacing: Spacing.sm) {
                    Image(systemName: symbol(for: link.brand))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(AnswerStyle.accent)
                        .frame(width: 36, height: 36)
                        .background(AnswerStyle.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: AnswerStyle.imageRadius, style: .continuous))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: link.title)
                            .font(TappyFont.footnote.weight(.semibold))
                            .foregroundStyle(AnswerStyle.text)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if let name = link.brandName {
                            Text(verbatim: name).font(.system(size: 12)).foregroundStyle(AnswerStyle.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(AnswerStyle.secondary)
                        .accessibilityHidden(true)
                }
                .padding(Spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                .answerSurface(radius: AnswerStyle.chipRadius)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint(Text(verbatim: LocalizationManager.currentLanguageCode == "en" ? "Opens the partner's page" : "Mở trang của đối tác"))
        }
    }

    private func symbol(for brand: PartnerLink.Brand) -> String {
        switch brand {
        case .vexere: return "bus"
        case .agoda: return "bed.double.fill"
        case .lazada: return "cart.fill"
        case .other: return "arrow.up.right.square"
        }
    }
}
