import SwiftUI

/// D1 — the shopping DECISION on iOS.
///
/// iOS used to strip `[TAPPY_SHOPPING]` and render nothing, so a user on a shopping turn silently
/// lost the recommendation, the price ranges, the match verdicts and every alternative. This is the
/// SwiftUI counterpart of web's `ShoppingDecision.tsx` and Android's `ShoppingDecisionCard.kt`, and
/// it is a PORT of that proven behaviour rather than a redesign (DD-008: Extract → Generalise →
/// Improve):
///
///   • it renders the DECISION, not a catalogue — one recommended configuration leads, and the
///     alternatives stay as compact rows so a valid option is never hidden;
///   • it groups NOTHING and infers NOTHING: every config label, price range, verdict and reason is
///     read straight from the server's view;
///   • a value the server did not supply renders as an explicit "chưa rõ", never as a fabricated
///     number and never as a blank.
struct ShoppingDecisionCardView: View {
    let view: ShoppingDecisionView

    private var recommended: ShoppingEntityView? {
        view.entities.first(where: { $0.recommended })
    }

    private var alternatives: [ShoppingEntityView] {
        guard let rec = recommended else { return view.entities }
        return view.entities.filter { $0.key != rec.key }
    }

    /// Reasons belong to the recommended entity only — a reason attached to a different entity
    /// would be a claim the server did not make.
    private var reasons: [ShoppingReason] {
        guard let rec = recommended,
              let r = view.recommendation,
              r.entityKey == rec.key else { return [] }
        return r.reasons
    }

    var body: some View {
        if view.entities.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                if let rec = recommended {
                    recommendedCard(rec)
                } else {
                    Text(String(localized: "shoppingDecision.optionsTitle"))
                        .font(TappyFont.headline)
                        .foregroundStyle(TappyColor.textPrimary)
                }

                if !alternatives.isEmpty {
                    if recommended != nil {
                        Text(String(localized: "shoppingDecision.otherOptions"))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    ForEach(alternatives) { alternativeRow($0) }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Recommended

    @ViewBuilder
    private func recommendedCard(_ entity: ShoppingEntityView) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            HStack(alignment: .top, spacing: Spacing.sm) {
                if let image = entity.image, let url = URL(string: image) {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().aspectRatio(contentMode: .fill)
                        } else {
                            Color.clear
                        }
                    }
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    .accessibilityHidden(true) // decorative — the config name carries the meaning
                }

                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    Text(String(localized: "shoppingDecision.recommended").uppercased())
                        .font(TappyFont.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(TappyColor.primary)

                    HStack(spacing: Spacing.xs) {
                        Text(entity.config)
                            .font(TappyFont.headline)
                            .fontWeight(.semibold)
                            .foregroundStyle(TappyColor.textPrimary)
                            .lineLimit(2)
                        MatchBadgeView(match: entity.matchesRequest)
                    }

                    Text(priceText(entity))
                        .font(TappyFont.body)
                        .foregroundStyle(TappyColor.textSecondary)

                    ForEach(Array(reasons.enumerated()), id: \.offset) { _, reason in
                        Text("· \(reason.evidence)")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }

                    if let tradeOff = view.recommendation?.tradeOff {
                        Text("\(String(localized: "shoppingDecision.tradeOff")): \(tradeOff.evidence)")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.warning)
                    }

                    if view.recommendation?.conditional == true {
                        Text(String(localized: "shoppingDecision.conditional"))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
            }

            // The merchant handoffs the Commerce Capability Platform resolved for this product (web
            // parity, components/chat/ShoppingDecision.tsx): DETAIL links are the buttons, the
            // marketplaces' searches only stand in when no detail link exists. Seller offer rows (a
            // Google Shopping redirect each) are kept only while no verified merchant handoff exists.
            CommerceHandoffRow(handoffs: entity.commerceHandoffs, emphasised: true)
            if entity.commerceHandoffs.detail.isEmpty {
                ForEach(Array(entity.offers.enumerated()), id: \.offset) { _, offer in
                    offerRow(offer)
                }
            }
        }
        .padding(Spacing.sm)
        .background(TappyColor.primary.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg)
                .stroke(TappyColor.primary.opacity(0.35), lineWidth: 1)
        )
    }

    // MARK: - Alternatives

    @ViewBuilder
    private func alternativeRow(_ entity: ShoppingEntityView) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            HStack(alignment: .top, spacing: Spacing.xs) {
                Text(entity.config)
                    .font(TappyFont.body)
                    .foregroundStyle(TappyColor.textPrimary)
                    .lineLimit(2)
                Spacer(minLength: Spacing.xs)
                MatchBadgeView(match: entity.matchesRequest)
            }
            Text(priceText(entity))
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
            CommerceHandoffRow(handoffs: entity.commerceHandoffs, emphasised: false)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.xs)
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Offers

    @ViewBuilder
    private func offerRow(_ offer: ShoppingOfferView) -> some View {
        let seller = offer.seller ?? String(localized: "shoppingDecision.unknownSeller")
        let price = offer.price.map { shoppingPriceRangeText(low: $0, high: nil, unknown: "") }
            ?? String(localized: "shoppingDecision.noPrice")

        HStack(spacing: Spacing.xs) {
            Text(offer.condition.map { "\(seller) · \($0)" } ?? seller)
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
                .lineLimit(1)
            Spacer(minLength: Spacing.xs)
            Text(price)
                .font(TappyFont.caption)
                .fontWeight(.medium)
                .foregroundStyle(TappyColor.textPrimary)
            if let urlString = offer.url, let url = URL(string: urlString) {
                Link(String(localized: "shoppingDecision.view"), destination: url)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.primary)
                    .minimumTapTarget()
            }
        }
        .padding(.top, Spacing.xs)
        .accessibilityElement(children: .combine)
    }

    private func priceText(_ entity: ShoppingEntityView) -> String {
        shoppingPriceRangeText(
            low: entity.priceLow,
            high: entity.priceHigh,
            unknown: String(localized: "shoppingDecision.noPrice")
        )
    }
}

/// The Shopping card's commerce handoffs — the SAME action the live place card renders, through
/// the same label resolver ("Mua trên Điện Máy Xanh", with the login boundary stated when the
/// merchant has one) and the same handoff beacon (opaque ids only). Nothing here composes a URL.
private struct CommerceHandoffRow: View {
    let handoffs: ShoppingCommerceHandoffs
    let emphasised: Bool

    private var actions: [PersistedPlaceAction] { (handoffs.detail + handoffs.search).map(\.asPlaceCardAction) }

    var body: some View {
        if !handoffs.isEmpty {
            FlexibleRow(actions: actions, emphasised: emphasised)
                .padding(.top, Spacing.xs)
                .onAppear {
                    let sink = DIContainer.shared.resolve(CommerceEventSink.self)
                    for a in actions { if let c = a.commerce { CommerceHandoffReporter.rendered(c, sink: sink) } }
                }
        }
    }

    /// Two per row, like the place card's action row: a merchant label with its login boundary needs the width.
    private struct FlexibleRow: View {
        let actions: [PersistedPlaceAction]
        let emphasised: Bool

        var body: some View {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                ForEach(chunks, id: \.first?.id) { row in
                    HStack(spacing: Spacing.xs) {
                        ForEach(row) { action in
                            let detail = action.urlKind == "direct"
                            Button {
                                openPlaceAction(action)
                            } label: {
                                Text(placeActionLabel(labelKey: action.labelKey, urlKind: action.urlKind, platform: action.platform).text)
                                    .font(.system(size: emphasised && detail ? 13 : 12, weight: detail ? .semibold : .medium))
                                    .foregroundStyle(detail ? TappyColor.primary : TappyColor.textSecondary)
                                    .padding(.horizontal, detail ? Spacing.sm : Spacing.xs)
                                    .padding(.vertical, Spacing.xs)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10)
                                            .stroke(detail ? TappyColor.primary.opacity(0.35) : Color.clear, lineWidth: 1)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }

        private var chunks: [[PersistedPlaceAction]] {
            stride(from: 0, to: actions.count, by: 2).map { Array(actions[$0..<min($0 + 2, actions.count)]) }
        }
    }
}

/// The match verdict.
///
/// Colour is never the only carrier of meaning (V3_DESIGN_SYSTEM.md §2.4) — the badge always shows
/// its label as text, so the verdict survives greyscale, colour blindness and VoiceOver alike.
private struct MatchBadgeView: View {
    let match: String

    private var label: String {
        switch match {
        case ShoppingMatch.exact: return String(localized: "shoppingDecision.matchExact")
        case ShoppingMatch.different: return String(localized: "shoppingDecision.matchDifferent")
        default: return String(localized: "shoppingDecision.matchUnknown")
        }
    }

    private var tint: Color {
        switch match {
        case ShoppingMatch.exact: return TappyColor.success
        case ShoppingMatch.different: return TappyColor.warning
        default: return TappyColor.textSecondary
        }
    }

    var body: some View {
        Text(label)
            .font(TappyFont.caption)
            .foregroundStyle(tint)
            .padding(.horizontal, Spacing.xs)
            .padding(.vertical, 2)
            .background(tint.opacity(0.12))
            .clipShape(Capsule())
    }
}
