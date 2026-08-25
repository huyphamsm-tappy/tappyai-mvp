import SwiftUI

/// Renders the grounded shopping DECISION parsed from the `[TAPPY_SHOPPING]` marker — the native
/// equivalent of Web's `ShoppingDecision.tsx`. It groups NOTHING and infers NOTHING: every config,
/// price range, match verdict and recommendation is read straight from the server object. One
/// recommended configuration leads; other configs stay compact; missing values read "chưa rõ",
/// never a fabricated number. All chrome strings go through the String Catalogue (EN/VI).
struct ShoppingDecisionView: View {
    let view: ShoppingDecision

    // MARK: Derived

    private var recommended: ShoppingDecision.Entity? { view.entities.first { $0.recommended } }

    private var others: [ShoppingDecision.Entity] {
        guard let rec = recommended else { return view.entities }
        return view.entities.filter { $0.id != rec.id }
    }

    /// The offer to feature: the recommended seller's, else the entity's first.
    private var recOffer: ShoppingDecision.Offer? {
        guard let rec = recommended else { return nil }
        if let seller = view.recommendation?.seller,
           let match = rec.offers.first(where: { $0.seller == seller }) { return match }
        return rec.offers.first
    }

    private var restOffers: [ShoppingDecision.Offer] {
        guard let rec = recommended, let feat = recOffer else { return recommended?.offers ?? [] }
        return rec.offers.filter { $0.id != feat.id }
    }

    private var reasons: [ShoppingDecision.Reason] {
        guard let rec = recommended, view.recommendation?.entityKey == rec.key else { return [] }
        return view.recommendation?.reasons ?? []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            if let rec = recommended {
                recommendedCard(rec)
            } else {
                Text(NSLocalizedString("shoppingDecision.optionsTitle", comment: ""))
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)
            }

            if !others.isEmpty {
                if recommended != nil {
                    Text(NSLocalizedString("shoppingDecision.otherOptions", comment: ""))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
                ForEach(others) { altRow($0) }
            }
        }
    }

    // MARK: Recommended card

    @ViewBuilder
    private func recommendedCard(_ e: ShoppingDecision.Entity) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: Spacing.sm) {
                if let image = e.image, let url = URL(string: image) {
                    AsyncImage(url: url) { phase in
                        if let img = phase.image {
                            img.resizable().aspectRatio(contentMode: .fill)
                        } else {
                            TappyColor.surfaceElevated
                        }
                    }
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(NSLocalizedString("shoppingDecision.recommended", comment: "").uppercased())
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.primary)
                    HStack(spacing: Spacing.xs) {
                        Text(e.config)
                            .font(TappyFont.bodyEmphasis)
                            .foregroundStyle(TappyColor.textPrimary)
                        matchBadge(e.matchesRequest)
                    }
                    Text(priceRange(e))
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textPrimary)

                    ForEach(Array(reasons.enumerated()), id: \.offset) { _, r in
                        Text("· \(r.evidence)")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    if let trade = view.recommendation?.tradeOff {
                        Text("\(NSLocalizedString("shoppingDecision.tradeOff", comment: "")): \(trade.evidence)")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.warning)
                    }
                    if view.recommendation?.conditional == true {
                        Text(NSLocalizedString("shoppingDecision.conditional", comment: ""))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
            }
            .padding(Spacing.sm)

            Divider().background(TappyColor.separator)

            VStack(spacing: 0) {
                if let feat = recOffer { offerRow(feat) }
                ForEach(restOffers) { offerRow($0) }
            }
            .padding(.horizontal, Spacing.sm)
        }
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                .strokeBorder(TappyColor.primary.opacity(0.35), lineWidth: 1)
        )
    }

    // MARK: Offer row

    @ViewBuilder
    private func offerRow(_ o: ShoppingDecision.Offer) -> some View {
        HStack(spacing: Spacing.xs) {
            Text(o.seller ?? NSLocalizedString("shoppingDecision.unknownSeller", comment: ""))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)
                .lineLimit(1)
            if let cond = o.condition {
                Text("· \(cond)")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: Spacing.xs)
            Text(money(o.price) ?? NSLocalizedString("shoppingDecision.noPrice", comment: ""))
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)
            if let urlStr = o.url, let url = URL(string: urlStr) {
                Link(NSLocalizedString("shoppingDecision.view", comment: ""), destination: url)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.primary)
            }
        }
        .padding(.vertical, Spacing.xs)
    }

    // MARK: Alternative entity row

    @ViewBuilder
    private func altRow(_ e: ShoppingDecision.Entity) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(e.config)
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
                Spacer(minLength: Spacing.xs)
                matchBadge(e.matchesRequest)
            }
            HStack(spacing: Spacing.xs) {
                Text(priceRange(e))
                Text("·")
                Text(sellerCount(e.offers.count))
            }
            .font(TappyFont.caption)
            .foregroundStyle(TappyColor.textSecondary)
        }
        .padding(Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                .strokeBorder(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: Match badge

    /// Label + colour for a match verdict. Plain function (not a result builder), so the switch is
    /// a normal control-flow statement — a @ViewBuilder cannot build an assigning switch.
    private func matchMeta(_ match: String) -> (label: String, color: Color) {
        switch match {
        case "khop": return (NSLocalizedString("shoppingDecision.matchExact", comment: ""), TappyColor.success)
        case "khac": return (NSLocalizedString("shoppingDecision.matchDifferent", comment: ""), TappyColor.warning)
        default:     return (NSLocalizedString("shoppingDecision.matchUnknown", comment: ""), TappyColor.textSecondary)
        }
    }

    private func matchBadge(_ match: String) -> some View {
        let meta = matchMeta(match)
        return Text(meta.label)
            .font(TappyFont.caption)
            .foregroundStyle(meta.color)
            .padding(.horizontal, Spacing.xs)
            .padding(.vertical, 2)
            .background(meta.color.opacity(0.12))
            .clipShape(Capsule())
    }

    // MARK: Formatting helpers

    private var isVI: Bool { LocalizationManager.currentLanguageCode == "vi" }

    private func sellerCount(_ n: Int) -> String {
        String(format: NSLocalizedString("shoppingDecision.sellerCount", comment: ""), n)
    }

    /// VND → "25,8 triệu" (vi) / "25.8M" (en). nil number → nil so the caller shows an honest label.
    private func money(_ n: Double?) -> String? {
        guard let n, n.isFinite else { return nil }
        if n >= 1_000_000 {
            let v = fmtMillions(n / 1_000_000)
            return String(format: NSLocalizedString("shoppingDecision.priceMillions", comment: ""), v)
        }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        let grouped = f.string(from: NSNumber(value: n)) ?? String(Int(n))
        return String(format: NSLocalizedString("shoppingDecision.priceDong", comment: ""), grouped)
    }

    private func fmtMillions(_ m: Double) -> String {
        let rounded = (m * 10).rounded() / 10
        let str = rounded == rounded.rounded() ? String(Int(rounded)) : String(format: "%.1f", rounded)
        return isVI ? str.replacingOccurrences(of: ".", with: ",") : str
    }

    private func priceRange(_ e: ShoppingDecision.Entity) -> String {
        let lo = money(e.priceLow), hi = money(e.priceHigh)
        if lo == nil && hi == nil { return NSLocalizedString("shoppingDecision.noPrice", comment: "") }
        if let lo, let hi, e.priceLow != e.priceHigh { return "\(lo) – \(hi)" }
        return (lo ?? hi) ?? NSLocalizedString("shoppingDecision.noPrice", comment: "")
    }
}
