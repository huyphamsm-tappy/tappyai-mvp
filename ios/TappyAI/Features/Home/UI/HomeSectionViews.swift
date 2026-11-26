import SwiftUI

// The sections of the V3 Home, in Android's approved order (L12, `HomeScreen.kt`). Each is a door:
// nothing here streams a reply or checks anything — it opens Chat, a tool, or another tab.

// MARK: - Shared pieces

/// "Xem tất cả ›" — the accent link with a trailing chevron.
struct HomeSeeAll: View {
    let titleKey: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 2) {
                Text(LocalizedStringKey(titleKey)).font(.system(size: 14, weight: .semibold))
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(HomeV3.purple)
            .padding(.horizontal, 6).padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

/// 22pt section title with a trailing link.
struct HomeSectionHeading: View {
    let titleKey: String
    var linkKey = "home.v3.seeAll"
    let onLink: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(LocalizedStringKey(titleKey)).font(.system(size: 22, weight: .bold)).foregroundStyle(HomeV3.onSurface)
                .frame(maxWidth: .infinity, alignment: .leading)
            HomeSeeAll(titleKey: linkKey, action: onLink)
        }
    }
}

/// Smaller heading (web `font-semibold`), optionally led by the orange sparkle.
struct HomeSmallHeading: View {
    let titleKey: String
    var sparkle = false
    var linkKey: String? = nil
    var onLink: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 8) {
            if sparkle { Image(systemName: "sparkles").font(.system(size: 14)).foregroundStyle(HomeV3.brandSpark) }
            Text(LocalizedStringKey(titleKey)).font(.system(size: 17, weight: .semibold)).foregroundStyle(HomeV3.onSurface)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let linkKey, let onLink { HomeSeeAll(titleKey: linkKey, action: onLink) }
        }
    }
}

/// The 52pt gradient tile + title + subtitle + link header used by Scam Shield and Deals.
struct HomeTileHeader: View {
    let symbol: String
    let gradient: LinearGradient
    let titleKey: String
    let subtitleKey: String
    let linkKey: String
    let onLink: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 16).fill(gradient).frame(width: 52, height: 52)
                .overlay(Image(systemName: symbol).font(.system(size: 22, weight: .semibold)).foregroundStyle(.white))
            VStack(alignment: .leading, spacing: 2) {
                Text(LocalizedStringKey(titleKey)).font(.system(size: 21, weight: .bold)).foregroundStyle(HomeV3.onSurface)
                Text(LocalizedStringKey(subtitleKey)).font(.system(size: 13)).foregroundStyle(HomeV3.onSurfaceVariant)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HomeSeeAll(titleKey: linkKey, action: onLink)
        }
    }
}

// MARK: - Hero

/// Welcome line, the time-of-day engine's two lines, the two status pills — mascot on the right
/// over a soft radial glow, never over the copy.
struct HomeGreetingSection: View {
    let hero: HeroGreeting

    var body: some View {
        // The copy sets the height; the mascot, its glow and the sparkles are an overlay, so they
        // never push the ask bar down (Android draws the mascot in a 0-high unbounded slot).
        // Web order: eyebrow → name line → the two-line contextual greeting → askSub.
        VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 6).fill(HomeV3.purple).frame(width: 19, height: 19)
                        .overlay(Image(systemName: "sparkles").font(.system(size: 11)).foregroundStyle(.white))
                    Text("home.v3.eyebrow").font(.system(size: 10.5, weight: .semibold)).kerning(1.6)
                        .textCase(.uppercase).foregroundStyle(HomeV3.blue).lineLimit(2)
                        .accessibilityIdentifier("home-eyebrow")
                }
                Text(hero.welcome).font(.system(size: 15, weight: .medium)).foregroundStyle(HomeV3.onSurfaceVariant)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .accessibilityIdentifier("home-welcome")
                Text(hero.title).font(.system(size: 26, weight: .semibold)).foregroundStyle(HomeV3.onSurface).lineLimit(3)
                if let supporting = hero.supporting {
                    Text(supporting).font(.system(size: 26, weight: .semibold)).foregroundStyle(HomeV3.blue).lineLimit(3)
                }
                Text("home.v3.askSub").font(.system(size: 15, weight: .light)).foregroundStyle(HomeV3.onSurfaceVariant)
                    .lineLimit(4).padding(.top, 4)
                    .accessibilityIdentifier("home-ask-sub")
        }
        .padding(.top, 8)
        .padding(.trailing, 110)
        .frame(maxWidth: .infinity, minHeight: 212, alignment: .topLeading)
        .background(alignment: .topTrailing) {
            ZStack {
                RadialGradient(colors: [HomeV3.heroGlow, .clear], center: .center, startRadius: 0, endRadius: 150)
                    .frame(width: 300, height: 300)
                Image("TappyWave").resizable().scaledToFit().frame(width: 200, height: 200)
                sparkle(11, 0.9, x: -80, y: -100)
                sparkle(8, 0.7, x: -90, y: 70)
                sparkle(7, 0.55, x: 95, y: 40)
            }
            .frame(width: 200, height: 212)
            .offset(x: 40, y: -10)
            .accessibilityHidden(true)
        }
    }

    private func sparkle(_ size: CGFloat, _ alpha: Double, x: CGFloat, y: CGFloat) -> some View {
        Image(systemName: "sparkle").font(.system(size: size)).foregroundStyle(HomeV3.blue.opacity(alpha))
            .offset(x: x, y: y).accessibilityHidden(true)
    }
}

// MARK: - Ask bar

/// A real text field (web `ask(text)`): typing and sending hands the question to Chat through
/// `onSend` — Home never answers in place. Attach and mic stay in Chat.
struct HomeAskBar: View {
    let onSend: (String) -> Void
    /// The "+" menu (web composer): Deep Research for the next question, or attaching a picture or file in the chat.
    var onDeepResearch: () -> Void = {}
    var onAttach: () -> Void = {}
    @State private var text = ""

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func submit() {
        let q = trimmed
        guard !q.isEmpty else { return }
        text = ""
        onSend(q)
    }

    var body: some View {
        HStack(spacing: 12) {
            Menu {
                Button { onAttach() } label: { Label("Thêm ảnh & tệp", systemImage: "paperclip") }
                    .accessibilityIdentifier("home-ask-attach")
                Button { onDeepResearch() } label: { Label("Nghiên cứu sâu", systemImage: "magnifyingglass.circle") }
                    .accessibilityIdentifier("home-ask-deep")
            } label: {
                Image(systemName: "plus").font(.system(size: 18, weight: .semibold)).foregroundStyle(HomeV3.onSurfaceVariant)
                    .frame(width: 32, height: 32)
            }
            .accessibilityLabel(Text("Thêm"))
            .accessibilityIdentifier("home-ask-plus")
            Image(systemName: "magnifyingglass").font(.system(size: 18)).foregroundStyle(HomeV3.onSurfaceVariant)
                .accessibilityHidden(true)
            TextField(LocalizedStringKey("home.v3.askPlaceholder"), text: $text)
                .font(.system(size: 17)).foregroundStyle(HomeV3.onSurface)
                .submitLabel(.send)
                .onSubmit(submit)
                .accessibilityLabel(Text("home.v3.askAction"))
                .accessibilityIdentifier("home-ask")
            Button(action: submit) {
                RoundedRectangle(cornerRadius: 18).fill(HomeV3.actionGradient).frame(width: 48, height: 48)
                    .overlay(Image(systemName: "arrow.up").font(.system(size: 20, weight: .semibold)).foregroundStyle(.white))
                    .opacity(trimmed.isEmpty ? 0.45 : 1)
            }
            .buttonStyle(.plain)
            .disabled(trimmed.isEmpty)
            .accessibilityLabel(Text("home.v3.askAction"))
            .accessibilityIdentifier("home-ask-send")
        }
        .padding(.leading, 20).padding(.trailing, 8)
        .frame(height: 64)
        .background(HomeV3.surface, in: RoundedRectangle(cornerRadius: 32))
        .overlay(RoundedRectangle(cornerRadius: 32).stroke(
            LinearGradient(colors: [HomeV3.purple.opacity(0.55), HomeV3.blue.opacity(0.45)], startPoint: .leading, endPoint: .trailing),
            lineWidth: 1))
        .shadow(color: HomeV3.purple.opacity(0.25), radius: 10, y: 3)
    }
}

// MARK: - Recommendations rail

/// "Gợi ý dành cho bạn". The artwork rotates by position — the payload carries no category — and
/// sits inset on a tinted panel, so it never reads as a photo of the place (Android rule).
struct HomeRecommendationsSection: View {
    let items: [Recommendation]
    let onOpen: () -> Void

    static let art = ["CategoryFood", "CategoryShopping", "CategoryTravel", "CategoryEntertainment", "CategorySpa"]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeSectionHeading(titleKey: "home.v3.recsTitle", onLink: onOpen)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(Array(items.enumerated()), id: \.element.placeId) { index, item in
                        Button(action: onOpen) { card(item, art: Self.art[index % Self.art.count]) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func card(_ item: Recommendation, art: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                LinearGradient(colors: [HomeV3.purple.opacity(0.45), HomeV3.blue.opacity(0.16)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(art).resizable().scaledToFill().frame(width: 104, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 12)).accessibilityHidden(true)
            }
            .frame(height: 96)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.placeName).font(.system(size: 14, weight: .semibold)).foregroundStyle(HomeV3.onSurface)
                    .lineLimit(2).multilineTextAlignment(.leading)
                if let signal = item.matchedSignals.first, !signal.isEmpty {
                    Text(signal).font(.system(size: 12)).foregroundStyle(HomeV3.onSurfaceVariant).lineLimit(1)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: 190)
        .background(HomeV3.surface)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(HomeV3.outline, lineWidth: 1))
    }
}

// MARK: - Discover banner

struct HomeDiscoverBanner: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                RoundedRectangle(cornerRadius: 18).fill(Color.white.opacity(0.16)).frame(width: 60, height: 60)
                    .overlay(Image(systemName: "rosette").font(.system(size: 30, weight: .semibold)).foregroundStyle(Color(hex: 0xFFD166)))
                VStack(alignment: .leading, spacing: 4) {
                    Text("home.v3.bannerTitle").font(.system(size: 18, weight: .bold)).foregroundStyle(.white).lineLimit(2)
                    Text("home.v3.bannerSubtitle").font(.system(size: 13)).foregroundStyle(.white.opacity(0.78)).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Circle().fill(Color.white.opacity(0.18)).frame(width: 52, height: 52)
                    .overlay(Image(systemName: "arrow.right").font(.system(size: 20, weight: .semibold)).foregroundStyle(.white))
            }
            .padding(.horizontal, 18).padding(.vertical, 22)
            .background(
                ZStack {
                    LinearGradient(colors: [Color(hex: 0x5B3FE0), Color(hex: 0x3D4BE0), Color(hex: 0x2B62E8)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                    RadialGradient(colors: [Color.white.opacity(0.22), .clear], center: UnitPoint(x: 0.9, y: 0.5),
                                   startRadius: 0, endRadius: 110)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .shadow(color: HomeV3.purple.opacity(0.4), radius: 12, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-banner")
    }
}

// MARK: - Scam Shield

struct HomeScamShieldSection: View {
    /// Where both the tile header and the check row lead.
    static let destination = HomeDestination.scamShield

    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeTileHeader(symbol: "shield.fill", gradient: HomeV3.gradient(0xF43F5E, 0xBE123C),
                           titleKey: "home.scamShield.title", subtitleKey: "home.scamShield.desc",
                           linkKey: "home.scamShield.cta", onLink: onOpen)
            Button(action: onOpen) {
                HStack(spacing: 14) {
                    RoundedRectangle(cornerRadius: 16).fill(HomeV3.purple.opacity(0.16)).frame(width: 48, height: 48)
                        .overlay(Image(systemName: "shield.fill").font(.system(size: 22)).foregroundStyle(HomeV3.purple))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("home.scamShield.checkTitle").font(.system(size: 15, weight: .bold)).foregroundStyle(HomeV3.onSurface)
                        Text("home.scamShield.tagline").font(.system(size: 12.5)).foregroundStyle(HomeV3.onSurfaceVariant).lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").foregroundStyle(HomeV3.onSurfaceVariant)
                }
                .padding(16)
                .background(HomeV3.surface, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(HomeV3.outline, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home-scam")
        }
    }
}

// MARK: - Community videos

/// "Video gợi ý cho bạn" over the trending community feed; tapping opens Explore, which owns
/// playback. Nothing is drawn while loading or when there are no clips.
struct HomeVideosSection: View {
    let videos: [Review]
    let onOpenExplore: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Circle().fill(HomeV3.purple).frame(width: 36, height: 36)
                    .overlay(Image(systemName: "play.fill").font(.system(size: 15)).foregroundStyle(.white))
                VStack(alignment: .leading, spacing: 2) {
                    Text("home.videos.title").font(.system(size: 17, weight: .semibold)).foregroundStyle(HomeV3.onSurface)
                    Text("home.videos.subtitle").font(.system(size: 12)).foregroundStyle(HomeV3.onSurfaceVariant)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                HomeSeeAll(titleKey: "home.videos.seeMore", action: onOpenExplore)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(videos) { review in
                        Button(action: onOpenExplore) { card(review) }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func card(_ review: Review) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .bottomLeading) {
                HomeV3.surfaceVariant
                if let url = URL(string: review.thumbnail ?? review.mediaUrl ?? "") {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                }
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill").font(.system(size: 10))
                    Text(Self.compact(review.likeCount)).font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Color.black.opacity(0.55), in: Capsule())
                .padding(8)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(String(format: NSLocalizedString("home.videos.likes", comment: ""), Self.compact(review.likeCount))))
            }
            .frame(width: 150, height: 190)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            Text(Self.title(review)).font(.system(size: 14, weight: .semibold)).foregroundStyle(HomeV3.onSurface)
                .lineLimit(2).multilineTextAlignment(.leading)
            if let creator = review.profiles?.fullName, !creator.isEmpty {
                Text(creator).font(.system(size: 12)).foregroundStyle(HomeV3.onSurfaceVariant).lineLimit(1)
            }
        }
        .frame(width: 150, alignment: .leading)
    }

    /// A place-less clip comes back named "Chia sẻ" — a placeholder, not a title; the body stands in.
    static func title(_ review: Review) -> String {
        let place = review.placeName?.trimmingCharacters(in: .whitespaces) ?? ""
        return (place.isEmpty || ComposerSentinel.isSharePlaceholder(place)) ? (review.body ?? "") : place
    }

    /// 12400 → "12.4K".
    static func compact(_ n: Int) -> String {
        func fmt(_ v: Double, _ s: String) -> String {
            let t = String(format: "%.1f", v)
            return (t.hasSuffix(".0") ? String(t.dropLast(2)) : t) + s
        }
        if n >= 1_000_000 { return fmt(Double(n) / 1_000_000, "M") }
        if n >= 1_000 { return fmt(Double(n) / 1_000, "K") }
        return "\(n)"
    }
}

// MARK: - Categories

struct HomeCategoriesSection: View {
    struct Category: Identifiable { let id: String; let emoji: String }
    static let categories: [Category] = [
        Category(id: "food", emoji: "🍜"), Category(id: "shopping", emoji: "🛍️"),
        Category(id: "entertainment", emoji: "🎭"), Category(id: "travel", emoji: "✈️"), Category(id: "spa", emoji: "💆"),
    ]
    let onOpen: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeSmallHeading(titleKey: "home.section.exploreByCategory", sparkle: true)
            HomeFlowLayout(spacing: 8) {
                ForEach(Self.categories) { cat in
                    Button { onOpen(cat.id) } label: {
                        HStack(spacing: 6) {
                            Text(cat.emoji).font(.system(size: 16))
                            Text(LocalizedStringKey("home.category." + cat.id)).font(.system(size: 14, weight: .medium))
                                .foregroundStyle(HomeV3.onSurface)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(HomeV3.surface, in: Capsule())
                        .overlay(Capsule().stroke(HomeV3.outline, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home-category-" + cat.id)
                }
            }
        }
    }
}

/// Wraps its children onto new lines (Android `FlowRow`), so all five categories stay visible.
struct HomeFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, maxX: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width { x = 0; y += rowH + spacing; rowH = 0 }
            x += size.width + spacing; rowH = max(rowH, size.height); maxX = max(maxX, x - spacing)
        }
        return CGSize(width: proposal.width ?? maxX, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing; rowH = max(rowH, size.height)
        }
    }
}

// MARK: - Suggestions

struct HomeSuggestionsSection: View {
    /// One card: the prompt it sends (in the app language), its category and the art for that slot.
    struct Suggestion: Identifiable { let id: Int; let text: String; let category: String; let emoji: String; var art = ""; var tone = "" }

    /// Web `getDynamicPrompts(hour, day, …, 5)` → `suggestions.slice(0, 5)` + `assignCardArt`,
    /// with hour and weekday in Vietnam time (web `page.tsx:83`).
    static let cardCount = 5

    static func make(now: Date = Date(), english: Bool) -> [Suggestion] {
        let (hour, dayOfWeek) = HomeSuggestedPrompts.vietnamHourAndDay(now)
        let prompts = Array(HomeSuggestedPrompts.get(hour: hour, dayOfWeek: dayOfWeek, count: cardCount).prefix(cardCount))
        return suggestions(from: prompts, english: english)
    }

    static func suggestions(from prompts: [HomeSuggestedPrompt], english: Bool) -> [Suggestion] {
        let art = HomeCardArt.assign(prompts.map { HomeCardArt.Card(category: $0.category, topic: $0.topic) })
        return prompts.enumerated().map { i, p in
            Suggestion(id: i + 1, text: english ? p.textEn : p.text, category: p.category, emoji: p.emoji, art: art[i], tone: p.tone)
        }
    }

    /// Web `CATEGORY_LABEL` (HomeV3.tsx:258): only the five verticals carry a label badge; any-topic cards have none.
    static func labelKey(_ category: String) -> String? {
        switch category {
        case "food", "travel", "shopping", "entertainment", "spa": return "home.suggest.cat." + category
        default: return nil
        }
    }

    let suggestions: [Suggestion]
    let onPrompt: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeSmallHeading(titleKey: "home.v3.forYouTitle", sparkle: true)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(suggestions) { s in
                    Button { onPrompt(s.text) } label: { card(s) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("home-suggestion-\(s.id)")
                }
            }
        }
    }

    private func card(_ s: Suggestion) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear.frame(height: 94)
                .background {
                    // Web: a mascot card sits on a deep-blue gradient (HomeV3.tsx:727).
                    if HomeCardArt.isMascot(s.art) {
                        LinearGradient(stops: [.init(color: Color(hex: 0x1B2A5E), location: 0),
                                               .init(color: Color(hex: 0x2B2260), location: 0.55),
                                               .init(color: Color(hex: 0x162447), location: 1)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing)
                    }
                }
                .overlay { HomeCardArtImage(art: s.art) }
                .overlay(alignment: .bottomLeading) {
                    if let key = Self.labelKey(s.category) {
                        Text(LocalizedStringKey(key)).textCase(.uppercase)
                            .font(.system(size: 9.5, weight: .bold)).kerning(0.6).foregroundStyle(.white)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Color(hex: 0x080B12, alpha: 0.66), in: RoundedRectangle(cornerRadius: 6))
                            .padding(.leading, 10).padding(.bottom, 8)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    Text(s.emoji).font(.system(size: 15)).frame(width: 32, height: 32)
                        .background(Self.tint(s.tone.isEmpty ? s.category : s.tone), in: RoundedRectangle(cornerRadius: 12))
                        .padding(10)
                }
                .clipped()
            Text(s.text).font(.system(size: 13, weight: .medium)).foregroundStyle(HomeV3.onSurface)
                .multilineTextAlignment(.leading) // web does not clamp (HomeV3.tsx:761)
                .fixedSize(horizontal: false, vertical: true)
                .padding(12)
                .frame(maxWidth: .infinity, minHeight: 60, alignment: .topLeading)
        }
        .background(HomeV3.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(HomeV3.outline, lineWidth: 1))
    }

    /// Badge gradient per tone (web `DEFAULT_GRADIENT` / `CAFE_GRADIENT`: `from-*-100 to-*-50`, bottom-right).
    static func tint(_ tone: String) -> LinearGradient {
        let stops: (from: UInt, to: UInt)
        switch tone {
        case "food": stops = (0xFFEDD5, 0xFFF7ED)
        case "shopping": stops = (0xFCE7F3, 0xFDF2F8)
        case "entertainment": stops = (0xF3E8FF, 0xFAF5FF)
        case "travel": stops = (0xDBEAFE, 0xEFF6FF)
        case "spa": stops = (0xDCFCE7, 0xF0FDF4)
        case "cafe": stops = (0xFEF3C7, 0xFFFBEB)
        default: stops = (0xEDE9FE, 0xF5F3FF) // general: violet
        }
        return LinearGradient(colors: [Color(hex: stops.from), Color(hex: stops.to)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// The picture for one card: a web art id (`/home/inspire/food-2.webp`, `/home/topics/work.webp`,
/// `/tappy/thinking.png`) resolved to its bundled file. Photos are `Resources/HomeInspire/*.webp`
/// (filled); mascot poses are the `Tappy*` image sets (fitted with 8pt padding, as on the web).
struct HomeCardArtImage: View {
    let art: String

    /// Bundle file name (without extension) for a photo id, nil for anything else.
    static func photoFile(_ art: String) -> String? {
        guard art.hasSuffix(".webp") else { return nil }
        let base = (art as NSString).lastPathComponent.replacingOccurrences(of: ".webp", with: "")
        if art.hasPrefix("/home/inspire/") { return "home_inspire_" + base }
        if art.hasPrefix("/home/topics/") { return "home_topic_" + base }
        return nil
    }

    /// Image-set name for a mascot id.
    static func mascotAsset(_ art: String) -> String? {
        switch art {
        case "/tappy/thinking.png": return "TappyThinking"
        case "/tappy/speaking.png": return "TappySpeaking"
        case "/tappy/recommendation.png": return "TappyRecommendation"
        case "/tappy/aitools.png": return "TappyAITools"
        case "/tappy/welcome.png": return "TappyWelcome"
        default: return nil
        }
    }

    var body: some View {
        if let asset = Self.mascotAsset(art) {
            Image(asset).resizable().scaledToFit().padding(8).accessibilityHidden(true)
        } else if let file = Self.photoFile(art),
                  let image = Bundle.main.path(forResource: file, ofType: "webp").flatMap(UIImage.init(contentsOfFile:)) {
            Image(uiImage: image).resizable().scaledToFill().accessibilityHidden(true)
        } else {
            HomeV3.surfaceVariant
        }
    }
}

// MARK: - Recent activity

struct HomeRecentConversationsSection: View {
    let rail: HomeViewModel.Rail<ConversationSummary>
    let language: String
    let onOpen: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeSmallHeading(titleKey: "home.v3.continue")
            switch rail {
            case .loading:
                ProgressView().frame(maxWidth: .infinity)
            case .loaded(let items):
                VStack(spacing: 8) {
                    ForEach(items) { conv in
                        Button { onOpen(conv.id) } label: { row(conv) }.buttonStyle(.plain)
                    }
                }
            case .empty:
                VStack(spacing: 8) {
                    Image(systemName: "clock.arrow.circlepath").font(.system(size: 26)).foregroundStyle(HomeV3.onSurfaceVariant)
                    Text("home.recent.emptyTitle").font(.system(size: 15, weight: .semibold)).foregroundStyle(HomeV3.onSurface)
                    Text("home.recent.emptyMessage").font(.system(size: 13)).foregroundStyle(HomeV3.onSurfaceVariant)
                        .multilineTextAlignment(.center)
                }
                .padding(20).frame(maxWidth: .infinity)
                .background(HomeV3.surface, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(HomeV3.outline, lineWidth: 1))
                .accessibilityIdentifier("home-recent-empty")
            }
        }
    }

    private func row(_ conv: ConversationSummary) -> some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 12).fill(HomeV3.surfaceVariant).frame(width: 40, height: 40)
                .overlay(Image(systemName: "bubble.left.fill").font(.system(size: 16)).foregroundStyle(Color(hex: 0x3391FF)))
            VStack(alignment: .leading, spacing: 2) {
                Text(conv.title ?? NSLocalizedString("home.recent.untitled", comment: ""))
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(HomeV3.onSurface).lineLimit(1)
                Text(subtitle(conv)).font(.system(size: 12)).foregroundStyle(HomeV3.onSurfaceVariant).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "arrow.right").foregroundStyle(HomeV3.onSurfaceVariant)
        }
        .padding(14)
        .background(HomeV3.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(HomeV3.outline, lineWidth: 1))
    }

    private func subtitle(_ conv: ConversationSummary) -> String {
        let count = String(format: NSLocalizedString("home.recent.messageCount", comment: ""), conv.messageCount)
        guard let date = conv.updatedAt else { return count }
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: language)
        return count + " · " + f.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Smart Tools

struct HomeQuickActionsSection: View {
    let onOpen: (SmartTool) -> Void
    let onSeeAll: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeSmallHeading(titleKey: "home.v3.smartTools.title", sparkle: true, linkKey: "home.v3.seeAll", onLink: onSeeAll)
            SmartToolGrid(tools: SmartTool.home, compact: true, onOpen: onOpen)
        }
    }
}
