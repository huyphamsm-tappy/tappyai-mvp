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
struct HomeHeroSection: View {
    let hero: HeroGreeting

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ZStack {
                RadialGradient(colors: [HomeV3.heroGlow, .clear], center: .center, startRadius: 0, endRadius: 150)
                    .frame(width: 300, height: 300)
                Image("TappyWave").resizable().scaledToFit().frame(width: 210, height: 210)
            }
            .offset(x: 64, y: -24)
            .accessibilityHidden(true)
            sparkle(11, 0.9, x: -150, y: 4)
            sparkle(8, 0.7, x: -160, y: 160)
            sparkle(7, 0.55, x: -8, y: 130)

            VStack(alignment: .leading, spacing: 8) {
                Text(hero.welcome).font(.system(size: 32, weight: .heavy)).foregroundStyle(HomeV3.onSurface)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .accessibilityIdentifier("home-welcome")
                Text(hero.title).font(.system(size: 22, weight: .bold)).foregroundStyle(HomeV3.onSurface).lineLimit(2)
                Text(hero.supporting ?? NSLocalizedString("home.v3.heroTagline", comment: ""))
                    .font(.system(size: 15)).foregroundStyle(HomeV3.onSurfaceVariant).lineLimit(2)
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Circle().fill(HomeV3.statusGreen).frame(width: 7, height: 7)
                        Text("home.v3.statusReady").font(.system(size: 13, weight: .medium)).foregroundStyle(HomeV3.statusGreen)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(HomeV3.statusGreen.opacity(0.16), in: Capsule())
                    Text("home.v3.statusTraits").font(.system(size: 13, weight: .medium)).foregroundStyle(HomeV3.onSurfaceVariant)
                        .lineLimit(1)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(HomeV3.surfaceVariant, in: Capsule())
                }
                .padding(.top, 6)
            }
            .padding(.top, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, 110)
        }
        .frame(maxWidth: .infinity, minHeight: 212, alignment: .topLeading)
    }

    private func sparkle(_ size: CGFloat, _ alpha: Double, x: CGFloat, y: CGFloat) -> some View {
        Image(systemName: "sparkle").font(.system(size: size)).foregroundStyle(HomeV3.blue.opacity(alpha))
            .offset(x: x, y: y).accessibilityHidden(true)
    }
}

// MARK: - Ask bar

/// A tall pill that opens Chat (the composer lives there, not on Home). The mic is part of the same
/// target, so it never implies that recording starts here.
struct HomeAskBar: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Text("home.v3.askPlaceholder").font(.system(size: 17)).foregroundStyle(HomeV3.onSurfaceVariant)
                    .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "mic.fill").font(.system(size: 20)).foregroundStyle(HomeV3.onSurfaceVariant)
                RoundedRectangle(cornerRadius: 18).fill(HomeV3.actionGradient).frame(width: 56, height: 56)
                    .overlay(Image(systemName: "sparkles").font(.system(size: 22, weight: .semibold)).foregroundStyle(.white))
            }
            .padding(.leading, 24).padding(.trailing, 8)
            .frame(height: 72)
            .background(HomeV3.surface, in: RoundedRectangle(cornerRadius: 34))
            .overlay(RoundedRectangle(cornerRadius: 34).stroke(
                LinearGradient(colors: [HomeV3.purple.opacity(0.55), HomeV3.blue.opacity(0.45)], startPoint: .leading, endPoint: .trailing),
                lineWidth: 1))
            .shadow(color: HomeV3.purple.opacity(0.45), radius: 14, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("home.v3.askAction"))
        .accessibilityIdentifier("home-ask")
    }
}

// MARK: - Quick suggestions

struct HomeQuickAction: Identifiable {
    enum Target { case chat(promptKey: String), destination(HomeDestination) }
    let id: String
    let symbol: String
    let gradient: (UInt, UInt)
    let target: Target
    var labelKey: String { "home.v3.quick." + id }
    var descKey: String { "home.v3.quick." + id + ".desc" }

    /// Android's six, in order: two open Chat pre-filled, four open a tool.
    static let all: [HomeQuickAction] = [
        HomeQuickAction(id: "cafe", symbol: "cup.and.saucer.fill", gradient: (0xFF8A4C, 0xFF5F6D), target: .chat(promptKey: "home.v3.quick.cafe.prompt")),
        HomeQuickAction(id: "translate", symbol: "character.bubble", gradient: (0x4F8CFF, 0x6A5CFF), target: .destination(.translate)),
        HomeQuickAction(id: "splitbill", symbol: "person.2.fill", gradient: (0x34D399, 0x10B981), target: .destination(.splitBill)),
        HomeQuickAction(id: "caption", symbol: "square.and.pencil", gradient: (0xFF6FB5, 0xD946EF), target: .destination(.vietContent)),
        HomeQuickAction(id: "travel", symbol: "mappin.and.ellipse", gradient: (0x8B7BFF, 0x6D4AFF), target: .destination(.recommendations)),
        HomeQuickAction(id: "plan", symbol: "calendar", gradient: (0xFFA94D, 0xFF7A3D), target: .chat(promptKey: "home.v3.quick.plan.prompt")),
    ]
}

struct HomeQuickSuggestionsSection: View {
    let onOpenChat: () -> Void
    let onAction: (HomeQuickAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeSectionHeading(titleKey: "home.v3.quickTitle", onLink: onOpenChat)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(HomeQuickAction.all) { action in
                    Button { onAction(action) } label: { pill(action) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("home-quick-" + action.id)
                }
            }
        }
    }

    private func pill(_ action: HomeQuickAction) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 12).fill(HomeV3.gradient(action.gradient.0, action.gradient.1))
                .frame(width: 40, height: 40)
                .overlay(Image(systemName: action.symbol).font(.system(size: 17, weight: .semibold)).foregroundStyle(.white))
            VStack(alignment: .leading, spacing: 2) {
                Text(LocalizedStringKey(action.labelKey)).font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(HomeV3.onSurface).lineLimit(2)
                Text(LocalizedStringKey(action.descKey)).font(.system(size: 11.5))
                    .foregroundStyle(HomeV3.onSurfaceVariant).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                .foregroundStyle(HomeV3.onSurfaceVariant.opacity(0.7))
        }
        .padding(.leading, 10).padding(.trailing, 6).padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 96)
        .background(HomeV3.surface, in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(HomeV3.outline.opacity(0.7), lineWidth: 1))
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

// MARK: - Deals

/// "Ưu đãi hôm nay" over the same pool the Deals tab reads. Only real fields are drawn (banner
/// when the feed sends one, the partner mark, a promotion when stated); no invented price/rating.
struct HomeDealsSection: View {
    let rail: HomeViewModel.Rail<PartnerDeal>
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HomeTileHeader(symbol: "tag.fill", gradient: HomeV3.gradient(0xFF9A5C, 0xFF6A3D),
                           titleKey: "home.v3.dealsTitle", subtitleKey: "home.v3.dealsSubtitle",
                           linkKey: "home.v3.seeAll", onLink: onOpen)
            switch rail {
            case .loaded(let deals):
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(deals) { deal in
                            Button(action: onOpen) { card(deal) }.buttonStyle(.plain)
                        }
                    }
                }
            case .empty:
                VStack(alignment: .leading, spacing: 6) {
                    Text("home.v3.dealsEmptyTitle").font(.system(size: 15, weight: .semibold)).foregroundStyle(HomeV3.onSurface)
                    Text("home.v3.dealsEmptyMessage").font(.system(size: 13)).foregroundStyle(HomeV3.onSurfaceVariant)
                }
                .padding(20).frame(maxWidth: .infinity, alignment: .leading)
                .background(HomeV3.surface, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(HomeV3.outline, lineWidth: 1))
                .accessibilityIdentifier("home-deals-empty")
            case .loading:
                EmptyView()
            }
        }
    }

    private func card(_ deal: PartnerDeal) -> some View {
        let banner = deal.bannerImage.flatMap { $0.isEmpty ? nil : URL(string: $0) }
        let discount = deal.discountLabel.flatMap { $0.isEmpty ? nil : $0 }
        let tall = banner != nil || discount != nil
        let accent = Self.accent(deal.categoryKey)
        return VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: tall ? .topLeading : .leading) {
                LinearGradient(colors: [accent.opacity(0.55), accent.opacity(0.14)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if let banner {
                    AsyncImage(url: banner) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                }
                LinearGradient(stops: [.init(color: .clear, location: 0.35), .init(color: .black.opacity(0.55), location: 1)],
                               startPoint: .top, endPoint: .bottom)
                mark(deal).padding(.horizontal, 16).padding(.vertical, 14)
                if let discount {
                    Text(discount).font(.system(size: 22, weight: .heavy)).foregroundStyle(.white).lineLimit(1)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                }
            }
            .frame(height: tall ? 136 : 104)
            .clipped()
            VStack(alignment: .leading, spacing: 4) {
                Text(deal.title).font(.system(size: 16, weight: .bold)).foregroundStyle(HomeV3.onSurface)
                    .lineLimit(2).multilineTextAlignment(.leading)
                Text(deal.category + " · " + String(format: NSLocalizedString("home.v3.dealsVia", comment: ""), deal.partnerName))
                    .font(.system(size: 12)).foregroundStyle(HomeV3.onSurfaceVariant).lineLimit(1)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: 248)
        .background(HomeV3.surface)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(HomeV3.outline.opacity(0.8), lineWidth: 1))
    }

    private func mark(_ deal: PartnerDeal) -> some View {
        Group {
            if let logo = deal.logoImage.flatMap({ URL(string: $0) }) {
                AsyncImage(url: logo) { $0.resizable().scaledToFit().padding(6) } placeholder: { monogram(deal) }
            } else {
                monogram(deal)
            }
        }
        .frame(width: 40, height: 40)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 12))
    }

    private func monogram(_ deal: PartnerDeal) -> some View {
        Text(String(deal.partnerName.prefix(1)).uppercased()).font(.system(size: 17, weight: .bold)).foregroundStyle(HomeV3.purple)
    }

    /// Panel tint per category key (presentation only; the feed carries no colour).
    static func accent(_ key: String) -> Color {
        switch key.lowercased() {
        case "food", "an uong", "ăn uống", "food & drink": return Color(hex: 0xFF8A4C)
        case "travel", "du lich", "du lịch": return Color(hex: 0x3391FF)
        case "shopping", "mua sam", "mua sắm": return Color(hex: 0xFF5FA2)
        case "entertainment", "giai tri", "giải trí": return Color(hex: 0x9B6BFF)
        default: return HomeV3.purple
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
        return (place.isEmpty || place == "Chia sẻ") ? (review.body ?? "") : place
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
    struct Suggestion: Identifiable { let id: Int; let category: String; let emoji: String; var art = "" }
    static let suggestions: [Suggestion] = {
        let base = [
            Suggestion(id: 1, category: "food", emoji: "🍜"), Suggestion(id: 2, category: "entertainment", emoji: "🎁"),
            Suggestion(id: 3, category: "food", emoji: "🍜"), Suggestion(id: 4, category: "travel", emoji: "✈️"),
            Suggestion(id: 5, category: "shopping", emoji: "🛍️"), Suggestion(id: 6, category: "entertainment", emoji: "🎮"),
        ]
        let art = HomeInspireArt.assign(base.map { $0.category })
        return zip(base, art).map { s, a in var s = s; s.art = a; return s }
    }()
    let onPrompt: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeSmallHeading(titleKey: "home.section.suggested")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(Self.suggestions) { s in
                    Button { onPrompt(Self.text(s)) } label: { card(text: Self.text(s), category: s.category, emoji: s.emoji, art: s.art) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("home-suggestion-\(s.id)")
                }
            }
        }
    }

    static func text(_ s: Suggestion) -> String { NSLocalizedString("home.suggestion.\(s.id)", comment: "") }

    private func card(text: String, category: String, emoji: String, art: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear.frame(height: 94)
                .overlay { HomeInspireImage(name: art) }
                .overlay(alignment: .bottomLeading) {
                    Text(NSLocalizedString("home.category." + category, comment: "").uppercased())
                        .font(.system(size: 9.5, weight: .bold)).kerning(0.6).foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Color(hex: 0x080B12, alpha: 0.66), in: RoundedRectangle(cornerRadius: 6))
                        .padding(.leading, 10).padding(.bottom, 8)
                }
                .overlay(alignment: .topTrailing) {
                    Text(emoji).font(.system(size: 15)).frame(width: 32, height: 32)
                        .background(Self.tint(category), in: RoundedRectangle(cornerRadius: 12))
                        .padding(10)
                }
                .clipped()
            Text(text).font(.system(size: 13, weight: .medium)).foregroundStyle(HomeV3.onSurface)
                .lineLimit(2).multilineTextAlignment(.leading)
                .padding(12)
                .frame(maxWidth: .infinity, minHeight: 60, alignment: .topLeading)
        }
        .background(HomeV3.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(HomeV3.outline, lineWidth: 1))
    }

    /// Light badge tint per category (web DEFAULT_GRADIENT top stop).
    static func tint(_ category: String) -> Color {
        switch category {
        case "food": return Color(hex: 0xFFEDD5)
        case "shopping": return Color(hex: 0xFCE7F3)
        case "entertainment": return Color(hex: 0xF3E8FF)
        case "travel": return Color(hex: 0xDBEAFE)
        case "spa": return Color(hex: 0xDCFCE7)
        default: return Color(hex: 0xF3F4F6)
        }
    }
}

/// One of the five web photographs (`Resources/HomeInspire/home_inspire_<name>.webp`).
struct HomeInspireImage: View {
    let name: String

    var body: some View {
        if let image = UIImage(named: "home_inspire_\(name).webp")
            ?? Bundle.main.path(forResource: "home_inspire_\(name)", ofType: "webp").flatMap(UIImage.init(contentsOfFile:)) {
            Image(uiImage: image).resizable().scaledToFill().accessibilityHidden(true)
        } else {
            HomeV3.surfaceVariant
        }
    }
}

// MARK: - Recent activity

struct HomeRecentSection: View {
    let rail: HomeViewModel.Rail<ConversationSummary>
    let language: String
    let onOpen: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeSmallHeading(titleKey: "home.section.recentActivity")
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

struct HomeSmartToolsSection: View {
    let onOpen: (SmartTool) -> Void
    let onSeeAll: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeSmallHeading(titleKey: "home.v3.smartTools.title", sparkle: true, linkKey: "home.v3.seeAll", onLink: onSeeAll)
            SmartToolGrid(tools: SmartTool.home, compact: true, onOpen: onOpen)
        }
    }
}
