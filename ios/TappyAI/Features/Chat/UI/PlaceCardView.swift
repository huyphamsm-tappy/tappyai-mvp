import SwiftUI

/// The place card on iOS — the SwiftUI counterpart of web's `PlaceDecision.tsx` and Android's
/// `PlaceCard.kt`.
///
/// A PORT of proven behaviour, not a redesign. It renders what the server already decided and
/// states nothing of its own:
///
///   • every row is conditional on the server having supplied the value. A place the source knew
///     only a name and a map link for renders a name and a map button — not a card full of empty
///     rows, and never a placeholder standing in for a fact. The server stopped writing its
///     "unknown" sentence into the payload for exactly this reason, so an absent field here is
///     genuinely absent;
///   • ordering is the server's `rank`. Nothing is re-sorted, re-scored or re-grouped on the client;
///   • "Popular" appears only where web puts it — the top-ranked place with enough ratings for the
///     word to mean something — so the three platforms cannot disagree about which place is popular.
///
/// WHY SOME DURABLE CARDS ARE THINNER THAN THE LIVE ONE. The live rail is built from the `8:`
/// annotation, which is never stored; the durable card is built from the message text, which is.
/// Google Places content must not be stored, so a Google-sourced row persists only its identifiers
/// and our own derived values (`mayPersist` on the server). That is a licensing outcome, not a bug,
/// and it must never be "fixed" here by re-fetching or by inventing a value.
struct PlaceCardsView: View {
    let places: [PlaceCardView]

    var body: some View {
        if places.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                ForEach(places) { place in
                    PlaceCardRow(place: place)
                }
            }
        }
    }
}

/// Web parity: `priceBand` in PlaceDecision.tsx — one to four symbols, or nothing at all.
func placePriceBand(_ level: Int?) -> String? {
    guard let level, level >= 1, level <= 4 else { return nil }
    return String(repeating: "đ", count: level)
}

private let popularMinRatings = 100

private struct PlaceCardRow: View {
    let place: PlaceCardView

    /// The user-facing label for an action.
    ///
    /// The server sends a `labelKey` (`v3.action.maps`), not a sentence, so the label is localised
    /// on the device that renders it — the same contract web resolves through its `w5/placeDecision`
    /// catalogue. A key this app version has never seen falls back to a generic "Open" rather than
    /// rendering the raw key, which is what a missing dictionary entry looked like on web.
    private func label(for action: PersistedPlaceAction) -> String {
        if action.urlKind == "search", let platform = action.platform, !platform.isEmpty {
            return String(format: String(localized: "place.action.searchOn"), platform)
        }
        switch action.labelKey.split(separator: ".").last.map(String.init) ?? "" {
        case "maps": return String(localized: "place.action.maps")
        case "directions": return String(localized: "place.action.directions")
        case "website": return String(localized: "place.action.website")
        case "order", "orderSearch": return String(localized: "place.action.order")
        case "delivery": return String(localized: "place.action.delivery")
        case "booking", "bookingSearch": return String(localized: "place.action.booking")
        case "reservation": return String(localized: "place.action.reservation")
        case "ticket", "ticketSearch": return String(localized: "place.action.ticket")
        case "call": return String(localized: "place.action.call")
        case "review", "reviewOn", "reviewSearch", "reviewSearchGeneric":
            return String(localized: "place.action.review")
        case "social": return String(localized: "place.action.social")
        case "searchGeneric", "searchOn": return String(localized: "place.action.searchGeneric")
        default: return String(localized: "place.action.open")
        }
    }

    private var popular: Bool {
        place.rank == 0 && (place.ratingCount ?? 0) >= popularMinRatings
    }

    /// Web groups the same way: the map button leads, the rest follow. An action with no URL is not
    /// a button — it is a lie, and the live projection drops it for the same reason.
    private var usableActions: [PersistedPlaceAction] {
        let usable = place.actions.filter { !$0.url.isEmpty }
        let maps = usable.first(where: { $0.kind == "maps" || $0.kind == "directions" })
        guard let maps else { return usable }
        return [maps] + usable.filter { $0.id != maps.id }
    }

    private var hoursLine: String? {
        let hours = place.openingHours.flatMap { $0.isEmpty ? nil : $0 }
        let state = place.openNow.map {
            $0 ? String(localized: "place.card.openNow") : String(localized: "place.card.closedNow")
        }
        let parts = [hours, state].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var priceDistanceLine: String? {
        let band = placePriceBand(place.priceLevel)
        let distance = place.distanceKm.map {
            String(format: String(localized: "place.card.away"), String($0))
        }
        let parts = [band, distance].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let image = place.image, !image.isEmpty, let url = URL(string: image) {
                AsyncImage(url: url) { phase in
                    if let img = phase.image {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Color.clear
                    }
                }
                .frame(height: 120)
                .clipped()
            }

            VStack(alignment: .leading, spacing: Spacing.xxs) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                    Text(place.name)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(TappyColor.textPrimary)
                        .lineLimit(2)
                    if popular {
                        Text("place.card.popular")
                            .font(.system(size: 11))
                            .foregroundStyle(TappyColor.accent)
                    }
                }

                // Web parity: a hotel CLASS is shown only when there is no guest rating, so a
                // 5-star hotel can never read as a 5.0 review score.
                if place.rating == nil, let stars = place.stars {
                    Text(String(format: String(localized: "place.card.stars"), String(stars)))
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.textSecondary)
                }

                if let rating = place.rating {
                    Text(
                        place.ratingCount.map {
                            "\(rating) · " + String(format: String(localized: "place.card.ratingCount"), String($0))
                        } ?? "\(rating)"
                    )
                    .font(.system(size: 13))
                    .foregroundStyle(TappyColor.textSecondary)
                }

                if let address = place.address, !address.isEmpty {
                    Text(address)
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.textSecondary)
                        .lineLimit(2)
                }

                if let hoursLine {
                    Text(hoursLine)
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.textSecondary)
                }

                if let priceDistanceLine {
                    Text(priceDistanceLine)
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.textSecondary)
                }

                // A price seen in a search snippet. Labelled as REFERENCE, because that is what it
                // is: presenting weak evidence as the place's price is what the label prevents.
                if let signal = place.priceSignal, !signal.isEmpty {
                    Text(String(localized: "place.card.referencePrice") + ": " + signal)
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.textSecondary)
                }

                // Provider categories, verbatim. Two, like web — a card is not a tag cloud.
                if !place.categories.isEmpty {
                    Text(place.categories.prefix(2).joined(separator: " · "))
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.textSecondary)
                }

                // Why the server ranked it here. Shown only when it said so — a card never writes
                // its own reason, which is the rule the whole decision layer is built on.
                ForEach(place.reasons, id: \.self) { reason in
                    Text(reason)
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.textSecondary)
                }

                // The honest half of a recommendation: what it costs you.
                if let tradeOff = place.tradeOff {
                    Text(String(localized: "place.card.tradeOff") + ": " + tradeOff)
                        .font(.system(size: 13))
                        .foregroundStyle(TappyColor.warning)
                }
            }
            .padding(Spacing.sm)

            if !usableActions.isEmpty {
                FlowActions(actions: usableActions, label: label)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.bottom, Spacing.sm)
            }
        }
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg)
                .stroke(TappyColor.border, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }
}

/// The action row. Wrapped rather than scrolled, so no destination is hidden off-screen.
private struct FlowActions: View {
    let actions: [PersistedPlaceAction]
    let label: (PersistedPlaceAction) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            ForEach(chunks, id: \.first?.id) { row in
                HStack(spacing: Spacing.xs) {
                    ForEach(row) { action in
                        Button {
                            // A URL the server built. A device with nothing able to open it is not
                            // worth an error on a card the user can still read.
                            if let url = URL(string: action.url) {
                                UIApplication.shared.open(url)
                            }
                        } label: {
                            Text(label(action))
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(TappyColor.textPrimary)
                                .padding(.horizontal, Spacing.sm)
                                .padding(.vertical, Spacing.xs)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(TappyColor.border, lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    /// Two per row: a phone is narrow, and a label like "Search on ShopeeFood" needs the width.
    private var chunks: [[PersistedPlaceAction]] {
        stride(from: 0, to: actions.count, by: 2).map {
            Array(actions[$0..<min($0 + 2, actions.count)])
        }
    }
}
