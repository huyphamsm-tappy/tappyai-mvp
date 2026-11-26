import SwiftUI

// The place / stay carousel (step 1 of the layout rework, owner mockups 26/11): a card of ~280 pt with a 16:9 picture, the name (2 lines), the rating,
// one line of address and the action chips; about one card and a bit of the next in view, snapping on iOS 17+. It draws what the server decided
// and nothing of its own: a field that is missing is not drawn, a picture that is missing or fails leaves no area, and a hotel's price and its
// «Đặt» chip appear only with a `stayOffer` and a link.

/// The position of each card in the carousel's own space, so the «1/N» marker knows which card leads.
struct PlaceCardMinXKey: PreferenceKey {
    static var defaultValue: [Int: CGFloat] = [:]
    static func reduce(value: inout [Int: CGFloat], nextValue: () -> [Int: CGFloat]) {
        value.merge(nextValue()) { _, new in new }
    }
}

extension View {
    /// One card at a time settles at the left edge (iOS 17+; on iOS 16 the row scrolls freely).
    @ViewBuilder func carouselSnapping() -> some View {
        if #available(iOS 17.0, *) { self.scrollTargetBehavior(.viewAligned) } else { self }
    }

    @ViewBuilder func carouselTargets() -> some View {
        if #available(iOS 17.0, *) { self.scrollTargetLayout() } else { self }
    }
}

struct PlaceCarouselCard: View {
    let place: PlaceCardView

    private var actions: [PersistedPlaceAction] { groupPlaceActions(place.actions).ordered }

    private func label(for action: PersistedPlaceAction) -> String {
        if action.commerce == nil { return placeActionSpec(action).text }
        return placeActionLabel(labelKey: action.labelKey, urlKind: action.urlKind, platform: action.platform).text
    }

    private func symbol(for action: PersistedPlaceAction) -> String {
        switch action.kind {
        case "maps", "directions": return "mappin.and.ellipse"
        case "call": return "phone"
        case "review": return "star"
        case "order", "delivery", "booking", "reservation", "ticket", "purchase": return "calendar.badge.plus"
        default: return action.urlKind == "search" ? "magnifyingglass" : "globe"
        }
    }

    /// «4,8 · 328 đánh giá»; a hotel's class only when there is no guest rating (a 5-star hotel must never read as a 5.0 review score).
    private var ratingLine: String? {
        if let rating = place.rating {
            return place.ratingCount.map { "\(rating) · " + String(format: String(localized: "place.card.ratingCount"), String($0)) } ?? "\(rating)"
        }
        if let stars = place.stars { return String(format: String(localized: "place.card.stars"), String(stars)) }
        return nil
    }

    private var hoursLine: String? {
        let hours = place.openingHours.flatMap { $0.isEmpty ? nil : $0 }
        let state = place.openNow.map { $0 ? String(localized: "place.card.openNow") : String(localized: "place.card.closedNow") }
        let parts = [hours, state].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            AnswerImage(url: place.image.flatMap { $0.isEmpty ? nil : safeWebURL($0) })
            VStack(alignment: .leading, spacing: 4) {
                Text(place.name).font(.headline).foregroundStyle(AnswerStyle.text).lineLimit(2)
                if let ratingLine { Text(ratingLine).font(.footnote).foregroundStyle(AnswerStyle.secondary) }
                if let address = place.address, !address.isEmpty {
                    Text(address).font(.footnote).foregroundStyle(AnswerStyle.secondary).lineLimit(1)
                }
                if let hoursLine { Text(hoursLine).font(.footnote).foregroundStyle(AnswerStyle.secondary) }
                // The provider's own price band, and a hotel's reference price from the realtime check with its platform and time (web `stayOfferLine`).
                if let band = PriceBand.format(place.priceRangeText, lang: LocalizationManager.currentLanguageCode) {
                    Text(band).font(.footnote).foregroundStyle(AnswerStyle.secondary)
                }
                if let offer = place.stayOffer, let line = StayOfferLine.text(offer, lang: LocalizationManager.currentLanguageCode) {
                    Text(line).font(.footnote.weight(.semibold)).foregroundStyle(AnswerStyle.text)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("place-stay-offer")
                }
                if !place.categories.isEmpty {
                    Text(place.categories.prefix(2).joined(separator: " · ")).font(.footnote).foregroundStyle(AnswerStyle.secondary)
                }
                // Why the server ranked it here, and what it costs you: shown only when it said so.
                ForEach(place.reasons, id: \.self) { reason in
                    Text(reason).font(.footnote).foregroundStyle(AnswerStyle.secondary).fixedSize(horizontal: false, vertical: true)
                }
                if let tradeOff = place.tradeOff {
                    Text(String(localized: "place.card.tradeOff") + ": " + tradeOff).font(.footnote).foregroundStyle(TappyColor.warning)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !actions.isEmpty {
                    ChatFlowLayout(spacing: Spacing.xs) {
                        ForEach(actions) { action in
                            Button { openPlaceAction(action) } label: { AnswerChip(text: label(for: action), symbol: symbol(for: action)) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.top, Spacing.xxs)
                    .onAppear {
                        // «commerce action rendered», once per card appearance — the distinction web keeps.
                        let sink = DIContainer.shared.resolve(CommerceEventSink.self)
                        for a in actions { if let c = a.commerce { CommerceHandoffReporter.rendered(c, sink: sink) } }
                    }
                }
            }
            .padding(Spacing.sm)
        }
        .frame(width: AnswerStyle.carouselCardWidth, alignment: .topLeading)
        .answerSurface()
        .accessibilityElement(children: .contain)
    }
}
