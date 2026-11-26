import SwiftUI

// The shared look of a rich answer block — step 1 of the layout rework (owner mockups 26/11, `D:\redesign\ios mockup`).
//
// One card shell with slots (title + symbol, subtitle, optional image area, body, action chips, footer), one rule for pictures, one accordion,
// one chip. Every later step (comparison, profiles, research, ...) is a variant of these. Colours, radii and spacing are the tokens the app
// already has (`ChatTheme`, `TappyColor`, `Spacing`); only what was missing is added here.

enum AnswerStyle {
    /// The side margin of an answer block (the mockup's 16 pt).
    static let margin = Spacing.md
    /// Card corner radius (mockup: 16 for a large card, 12 for a small one or a chip, 8 for a picture or an icon tile).
    static let cardRadius: CGFloat = 16
    static let chipRadius: CGFloat = 12
    static let imageRadius: CGFloat = 8
    /// A stop's thumbnail (mockup: 56 × 56).
    static let thumb: CGFloat = 56
    /// A carousel card (mockup: about 280 wide, a 16:9 picture ≈ 158 high).
    static let carouselCardWidth: CGFloat = 280
    static let carouselImageHeight: CGFloat = 158

    // Mockup colour table → the tokens the app has: surface #111B2E ≈ ChatTheme.panel, outline #22324A ≈ ChatTheme.border, text #FFFFFF ≈ ChatTheme.text,
    // secondary #A7B3C6 ≈ TappyColor.textSecondary, primary #007AFF = TappyColor.primary.
    static let surface = ChatTheme.panel
    static let border = ChatTheme.border
    static let text = ChatTheme.text
    static let secondary = TappyColor.textSecondary
    static let accent = TappyColor.primary

    /// What the reply text leaves on the left for the avatar (32 pt + 8 pt). A block that spans the whole width pulls this back.
    static let avatarInset: CGFloat = 40
}

extension View {
    /// The answer block starts at the 16 pt margin instead of after the avatar column (the ~17% left gap of the old layout).
    func answerFullBleed(_ on: Bool = true) -> some View {
        padding(.leading, on ? -AnswerStyle.avatarInset : 0)
    }

    /// The card surface: one layer, one outline, no card inside a card.
    func answerSurface(radius: CGFloat = AnswerStyle.cardRadius) -> some View {
        background(AnswerStyle.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(AnswerStyle.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

/// The shell: header (symbol + title + subtitle + a trailing note), an optional picture area, the body, a row of action chips and a footer.
/// A slot that is not wanted is passed as `EmptyView()` and takes no room.
struct AnswerCard<Media: View, Content: View, Chips: View, Footer: View>: View {
    let title: String?
    let symbol: String?
    let subtitle: String?
    let trailing: String?
    private let media: Media
    private let content: Content
    private let chips: Chips
    private let footer: Footer

    init(title: String? = nil, symbol: String? = nil, subtitle: String? = nil, trailing: String? = nil,
         @ViewBuilder media: () -> Media, @ViewBuilder content: () -> Content,
         @ViewBuilder chips: () -> Chips, @ViewBuilder footer: () -> Footer) {
        self.title = title
        self.symbol = symbol
        self.subtitle = subtitle
        self.trailing = trailing
        self.media = media()
        self.content = content()
        self.chips = chips()
        self.footer = footer()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            media
            VStack(alignment: .leading, spacing: Spacing.xs) {
                if title != nil || subtitle != nil {
                    HStack(alignment: .top, spacing: Spacing.xs) {
                        if let symbol {
                            Image(systemName: symbol).font(.title3).foregroundStyle(AnswerStyle.accent).accessibilityHidden(true)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            if let title { Text(title).font(.headline).foregroundStyle(AnswerStyle.text).fixedSize(horizontal: false, vertical: true) }
                            if let subtitle { Text(subtitle).font(.footnote).foregroundStyle(AnswerStyle.secondary).fixedSize(horizontal: false, vertical: true) }
                        }
                        Spacer(minLength: 0)
                        if let trailing { Text(trailing).font(.footnote).foregroundStyle(AnswerStyle.secondary) }
                    }
                }
                content
                chips
                footer
            }
            .padding(Spacing.md)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .answerSurface()
    }
}

/// The picture rule, one for every block: a picture when there is one; a grey skeleton while it loads; and when there is none, or it fails to
/// load, NO area at all — the card shrinks (owner UAT 26/11: a black block ~250 pt tall stood where a picture failed).
struct AnswerImage: View {
    let url: URL?
    var height: CGFloat = AnswerStyle.carouselImageHeight

    var body: some View {
        if let url {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                        .frame(maxWidth: .infinity).frame(height: height).clipped()
                case .failure:
                    EmptyView()
                default:
                    Rectangle().fill(AnswerStyle.secondary.opacity(0.18)).frame(height: height)
                        .accessibilityHidden(true)
                }
            }
        }
    }
}

/// A chip: text that wraps (never below 12 pt, grows with Dynamic Type), an optional symbol. A button wraps it when it acts.
struct AnswerChip: View {
    let text: String
    var symbol: String? = nil
    var selected = false

    var body: some View {
        HStack(spacing: 6) {
            if let symbol { Image(systemName: symbol).font(.footnote).accessibilityHidden(true) }
            Text(text).font(.footnote.weight(.medium)).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(selected ? Color.white : AnswerStyle.text)
        .padding(.horizontal, Spacing.sm).padding(.vertical, 7)
        .background(selected ? AnswerStyle.accent : Color.clear, in: RoundedRectangle(cornerRadius: AnswerStyle.chipRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: AnswerStyle.chipRadius, style: .continuous)
            .stroke(selected ? Color.clear : AnswerStyle.border, lineWidth: 1))
    }
}

/// The shared accordion: closed by default, opens and closes in 0.22 s. Built on `DisclosureGroup`; the label carries a symbol, the title and the count.
struct AnswerAccordion<Content: View>: View {
    let title: String
    let symbol: String
    var count: Int? = nil
    @State private var open = false
    private let content: Content

    init(title: String, symbol: String, count: Int? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.symbol = symbol
        self.count = count
        self.content = content()
    }

    var body: some View {
        DisclosureGroup(isExpanded: Binding(get: { open }, set: { value in withAnimation(.easeInOut(duration: 0.22)) { open = value } })) {
            content
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, Spacing.xs)
        } label: {
            HStack(spacing: Spacing.xs) {
                Image(systemName: symbol).font(.title3).foregroundStyle(AnswerStyle.accent).accessibilityHidden(true)
                Text(count.map { "\(title) · \($0)" } ?? title).font(.headline).foregroundStyle(AnswerStyle.text)
            }
        }
        .tint(AnswerStyle.secondary)
        .padding(Spacing.md)
        .answerSurface()
    }
}

#if DEBUG
/// The three states of a picture slot, for the preview canvas: a picture, none (the card shrinks), and one that cannot load.
struct AnswerCard_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: Spacing.md) {
            AnswerCard(title: "Ha Giang Aya Lodge", subtitle: "4,8 · 328 đánh giá",
                       media: { AnswerImage(url: URL(string: "https://example.invalid/none.jpg")) },
                       content: { Text("Thôn Nậm Hồng, Quản Bạ, Hà Giang").font(.footnote) },
                       chips: { AnswerChip(text: "Bản đồ", symbol: "mappin.and.ellipse") },
                       footer: { EmptyView() })
            AnswerCard(title: "Không có ảnh", subtitle: nil,
                       media: { AnswerImage(url: nil) }, content: { EmptyView() }, chips: { EmptyView() }, footer: { EmptyView() })
            AnswerAccordion(title: "Món nên thử", symbol: "fork.knife", count: 2) { Text("Thắng cố").font(.footnote) }
        }
        .padding(AnswerStyle.margin)
        .background(ChatTheme.background)
        .preferredColorScheme(.dark)
    }
}
#endif
