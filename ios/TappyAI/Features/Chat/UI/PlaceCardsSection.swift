import SwiftUI

/// The place decision on the phone (web `PlaceDecision.tsx`, Android `PlaceDecisionSection`), drawn as the step-1 carousel: an optional header
/// («Gợi ý chỗ ở (8)» with the «1/8» marker), the filter chips the data allows, a row of ~280 pt cards with the next one peeking, «Xem thêm N chỗ»
/// as the last card, and the Maps footer. The rules are the old ones and unchanged: ordering is the server's `rank`, a chip is offered only
/// when it changes the result, and the fold is the server's `shown`.
struct PlaceCardsView: View {
    let places: [PlaceCardView]
    /// «Xem tất cả trên bản đồ» — the live annotation's own Maps search URL; nil hides the footer.
    var mapsSearchURL: String? = nil
    /// Cards above «Xem thêm» (server `shown`); nil renders every card.
    var shown: Int? = nil
    /// The section header, e.g. «Gợi ý chỗ ở». Nil draws the carousel without one. The count is added here.
    var title: String? = nil
    var symbol: String = "bed.double.fill"

    @State private var active: PlaceFilterId = .all
    @State private var expanded = false
    @State private var leading = 0

    var body: some View {
        if places.isEmpty {
            EmptyView()
        } else {
            let filters = placeFilters(places)
            let current = filters.contains(active) ? active : .all
            let folded = foldedPlaces(places, shown: shown, expanded: expanded, filter: current)
            VStack(alignment: .leading, spacing: Spacing.sm) {
                if let title { header(title, count: places.count, pages: folded.pages.count) }

                if showsPlaceFilterRow(places, filters: filters) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.xs) {
                            ForEach(filters, id: \.self) { f in chip(f, selected: f == current) }
                        }
                    }
                }

                if !folded.pages.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: Spacing.sm) {
                            ForEach(Array(folded.pages.enumerated()), id: \.element.id) { index, place in
                                PlaceCarouselCard(place: place)
                                    .background(GeometryReader { proxy in
                                        Color.clear.preference(key: PlaceCardMinXKey.self,
                                                               value: [index: proxy.frame(in: .named("placeCarousel")).minX])
                                    })
                            }
                            if let shown, shown > 0, places.count > shown, current == .all, folded.hidden > 0 || expanded {
                                moreCard(hidden: folded.hidden)
                            }
                        }
                        .carouselTargets()
                        .padding(.trailing, AnswerStyle.margin)
                    }
                    .carouselSnapping()
                    .coordinateSpace(name: "placeCarousel")
                    .onPreferenceChange(PlaceCardMinXKey.self) { positions in
                        // The leading card is the one whose left edge is nearest the carousel's own left edge.
                        if let nearest = positions.min(by: { abs($0.value) < abs($1.value) })?.key, nearest != leading { leading = nearest }
                    }
                    // The row runs to the screen edge so the next card peeks in; the cards themselves keep the 16 pt margin.
                    .padding(.trailing, -AnswerStyle.margin)
                    .id(current)
                    .accessibilityIdentifier("place-cards")
                }

                if let url = mapsSearchURL, !url.isEmpty { mapsFooter(url) }
            }
        }
    }

    private func header(_ title: String, count: Int, pages: Int) -> some View {
        HStack(spacing: Spacing.xs) {
            Image(systemName: symbol).font(.title3).foregroundStyle(AnswerStyle.accent).accessibilityHidden(true)
            Text("\(title) (\(count))").font(.headline).foregroundStyle(AnswerStyle.text)
            Spacer(minLength: 0)
            if pages > 1 {
                Text("\(min(leading, pages - 1) + 1)/\(pages)").font(.footnote).foregroundStyle(AnswerStyle.secondary)
                    .padding(.horizontal, Spacing.xs).padding(.vertical, 4)
                    .background(AnswerStyle.surface, in: Capsule())
                    .accessibilityIdentifier("place-marker")
            }
        }
    }

    private func chip(_ f: PlaceFilterId, selected: Bool) -> some View {
        Button { active = f; expanded = false; leading = 0 } label: {
            AnswerChip(text: f == .all
                       ? String(format: String(localized: "place.filter.all"), places.count)
                       : NSLocalizedString(f.labelKey, comment: ""),
                       selected: selected)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("place-filter-" + f.rawValue)
    }

    /// «Xem thêm N chỗ» as the last card of the row (and «Thu gọn» once open).
    private func moreCard(hidden: Int) -> some View {
        Button { expanded.toggle() } label: {
            VStack(spacing: Spacing.xs) {
                Image(systemName: expanded ? "chevron.left" : "chevron.right").font(.title3)
                Text(expanded ? String(localized: "place.showLess") : String(format: String(localized: "place.showMore"), hidden))
                    .font(.footnote.weight(.semibold)).multilineTextAlignment(.center)
            }
            .foregroundStyle(AnswerStyle.accent)
            .frame(width: 120)
            .frame(maxHeight: .infinity)
            .padding(Spacing.sm)
            .answerSurface()
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("place-show-more")
    }

    private func mapsFooter(_ url: String) -> some View {
        Button {
            if let u = safeWebURL(url) { UIApplication.shared.open(u) }
        } label: {
            HStack(spacing: Spacing.sm) {
                Image(systemName: "map.fill").foregroundStyle(AnswerStyle.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("place.exploreMap").font(.subheadline.weight(.medium)).foregroundStyle(AnswerStyle.accent)
                    Text("place.exploreMap.hint").font(.footnote).foregroundStyle(AnswerStyle.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(AnswerStyle.secondary)
            }
            .padding(Spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .answerSurface(radius: AnswerStyle.chipRadius)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("place-explore-map")
    }
}
