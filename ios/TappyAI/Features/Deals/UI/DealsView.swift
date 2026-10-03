import SwiftUI

struct DealsView: View {
    @AppStateObject private var vm: DealsViewModel
    @AppEnvironmentState private var localization: LocalizationManager
    @AppEnvironmentState private var router: AppRouter

    init(deps: AppDependencies) {
        _vm = AppStateObject(wrappedValue: DealsViewModel(service: DealsService(api: deps.api)))
    }

    var body: some View {
        Group {
            switch vm.state {
            case .idle, .loading:
                ScrollView {
                    VStack(spacing: Spacing.md) {
                        ForEach(0..<4, id: \.self) { _ in
                            TappySkeleton().frame(height: 96)
                        }
                    }
                    .padding(Spacing.md)
                }
            case .failed:
                // `Presentation` takes plain Strings, so the keys resolve here; TappyEmptyState's
                // `title` is a LocalizedStringKey and takes the key directly.
                TappyErrorState(
                    presentation: .init(
                        title: NSLocalizedString("common.loadFailed", comment: ""),
                        message: NSLocalizedString("common.tryAgainLater", comment: ""),
                        retryable: true
                    ),
                    onRetry: { Task { await vm.load(lang: localization.language.rawValue) } }
                )
                .padding(.top, 60)
            case .loaded:
                if vm.deals.isEmpty {
                    // The ask-Tappy card shows even with no deals (web `/deals`, Android L16).
                    ScrollView {
                        VStack(spacing: Spacing.lg) {
                            askHero(partners: [])
                            TappyEmptyState(systemImage: "tag", title: "deals.empty")
                        }
                        .padding(Spacing.md)
                    }
                } else {
                    list
                }
            }
        }
        .background(TappyColor.background)
        .navigationTitle("deals.title")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load(lang: localization.language.rawValue) }
        .refreshable { await vm.load(lang: localization.language.rawValue) }
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: Spacing.sm) {
                askHero(partners: vm.deals.map(\.partnerName).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } })
                ForEach(vm.deals) { deal in
                    dealCard(deal)
                }
            }
            .padding(Spacing.md)
        }
    }

    /// "Hỏi Tappy trước khi mua" — its CTA opens the real Chat. The partner chips are the names the
    /// feed really returned (no brand logos: the feed sends none).
    private func askHero(partners: [String]) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(spacing: Spacing.md) {
                Image("TappyShopping").resizable().scaledToFit().frame(width: 76, height: 76)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("deals.hero.title").font(.system(size: 17, weight: .bold)).foregroundStyle(.white)
                    Text("deals.hero.body").font(.system(size: 12.5)).foregroundStyle(Color(hex: 0xCBD5E1))
                }
            }
            Button {
                router.popToRoot(on: .chat)
                router.switchTo(.chat)
            } label: {
                HStack(spacing: 8) {
                    Text("deals.hero.cta").font(.system(size: 14, weight: .semibold))
                    Image(systemName: "arrow.right").font(.system(size: 14))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, Spacing.lg).padding(.vertical, Spacing.sm)
                .background(Capsule().fill(LinearGradient(colors: [Color(hex: 0x6366F1), Color(hex: 0x8B7CFF)],
                                                          startPoint: .leading, endPoint: .trailing)))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("deals-ask-tappy")
            if !partners.isEmpty {
                Text("deals.hero.platforms").font(.system(size: 10.5, weight: .semibold)).foregroundStyle(Color(hex: 0x94A3B8))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.xs) {
                        // Web: one logo per platform that really appears in the feed (official mark from the brand
                        // registry, else the partner's initial), in a 40-pt tile, non-interactive.
                        ForEach(partners, id: \.self) { name in
                            Group {
                                if let brand = BrandRegistry.resolve(name) {
                                    BrandLogoView(brand: brand, size: 28)
                                } else {
                                    Text(String(name.prefix(1)).uppercased())
                                        .font(.system(size: 12, weight: .bold)).foregroundStyle(Color(hex: 0xF59E0B))
                                        .accessibilityLabel(Text(verbatim: name))
                                }
                            }
                            .frame(width: 40, height: 40)
                            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.12)))
                        }
                    }
                }
            }
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [Color(hex: 0x1E2A78), Color(hex: 0x3B2E8F)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.2), lineWidth: 1))
        // No identifier on this container: SwiftUI pushes a container's identifier down onto its
        // direct children, which hid the CTA's own "deals-ask-tappy" from the UI test (CI 30/09),
        // exactly as it did the hub's guest sign-in button in the first run.
    }

    @ViewBuilder
    private func dealCard(_ deal: PartnerDeal) -> some View {
        Button { open(deal) } label: {
            HStack(spacing: Spacing.md) {
                logo(deal)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: Spacing.xs) {
                        Text(deal.partnerName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(TappyColor.textPrimary)
                        categoryBadge(deal.categoryKey, label: deal.category)
                        if deal.isFeatured {
                            Text("⭐")
                                .font(.system(size: 11))
                        }
                    }
                    // The feed's `title` is often the partner's own name («Shopee» / «Shopee»): never print it twice.
                    // Then the line under the name is what the partner is for (`description`).
                    let sub = Self.subtitle(for: deal)
                    if !sub.isEmpty {
                        Text(sub)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(TappyColor.textPrimary)
                            .lineLimit(2)
                    }
                    if let discount = deal.discountLabel {
                        Text(discount)
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(TappyColor.danger)
                    }
                    if let code = deal.voucherCode {
                        Text("Mã: \(code)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(TappyColor.primary)
                    }
                }
                Spacer()
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 16))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .padding(Spacing.md)
        }
        .buttonStyle(.plain)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(TappyColor.border, lineWidth: 1))
    }

    /// Web fallback order (`BRAND_ASSETS.md` §8): the registry's official logo → the deal's own `logoImage` → the initial.
    @ViewBuilder
    private func logo(_ deal: PartnerDeal) -> some View {
        if let brand = BrandRegistry.resolve(deal.partnerName) {
            BrandLogoView(brand: brand, size: 48, decorative: true)
        } else {
            plainLogo(deal)
        }
    }

    @ViewBuilder
    private func plainLogo(_ deal: PartnerDeal) -> some View {
        Group {
            if let url = deal.logoImage, let imageURL = URL(string: url) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image): image.resizable().aspectRatio(contentMode: .fit).padding(8)
                    default: fallbackLogo(deal)
                    }
                }
            } else {
                fallbackLogo(deal)
            }
        }
        .frame(width: 48, height: 48)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    }

    private func fallbackLogo(_ deal: PartnerDeal) -> some View {
        Text(String(deal.partnerName.prefix(1)).uppercased())
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(TappyColor.primary)
    }

    /// Deterministic color keyed on `categoryKey` (never `category`) so a badge's color stays
    /// stable across a language switch — the Deals-specific instance of the same class of bug
    /// Android hit and fixed for its category→color mapping (Production Knowledge Base §10).
    @ViewBuilder
    private func categoryBadge(_ key: String, label: String) -> some View {
        let color = Self.color(for: key)
        Text(label)
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    static func subtitle(for deal: PartnerDeal) -> String {
        func norm(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        let title = deal.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !title.isEmpty, norm(title) != norm(deal.partnerName) { return title }
        return (deal.description ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static let palette: [Color] = [.orange, .blue, .purple, .green, .pink, .indigo, .teal, .brown]

    private static func color(for categoryKey: String) -> Color {
        let hash = categoryKey.unicodeScalars.reduce(0) { $0 &+ Int($1.value) }
        return palette[hash % palette.count]
    }

    /// Opens exactly the deal's `officialUrl` (what the Web card links to), and only if it is an https URL with a host
    /// (`DealLink`). A missing or unsafe URL opens nothing and counts no click.
    private func open(_ deal: PartnerDeal) {
        guard let url = DealLink.url(from: deal.officialUrl) else { return }
        vm.openDeal(deal)
        UIApplication.shared.open(url)
    }
}
