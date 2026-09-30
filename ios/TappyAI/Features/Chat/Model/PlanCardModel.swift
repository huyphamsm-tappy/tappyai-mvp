import Foundation

// Plan card v2 — the pure half (owner 29/09, sample `docs/design/share-layouts/plan-share.png`, "Quy Nhơn 3 ngày
// 2 đêm"): what the card shows, decided from the `TappyPlan` alone. A 1:1 port of Android
// `chat/plan/PlanCardView.kt` (`planCardViewOf`), so both apps draw the same card from the same block.
//
// Three rules the owner fixed and this file enforces:
//  1. IMAGES: only the image keys STORED in the plan (`hero_image`, `items[].image`, `highlights[].image`) are
//     shown, resolved to a URL through the image manifest (`PlanImageManifest`). The app never picks, guesses or
//     randomises a picture — a stop's Google `photo_url` is NOT used. A key the manifest cannot serve (or no key at
//     all) draws the gradient placeholder of the plan's area.
//  2. MONEY: only the figures the server wrote. A stop whose price is not an amount reads exactly
//     `PlanCardModel.noPrice`; nothing is summed, divided or estimated on the device.
//  3. ALL FIVE AREAS use the same frame. A non-travel plan is one session ("Tối nay") with times of day — one day
//     block, the same timeline, overview, highlights and call to action.

enum PlanArea: String, CaseIterable, Sendable {
    case travel = "du-lich"
    case food = "an-uong"
    case entertainment = "giai-tri"
    case shopping = "mua-sam"
    case spa = "spa"

    var slug: String { rawValue }

    var emoji: String {
        switch self {
        case .travel: return "✈️"
        case .food: return "🍜"
        case .entertainment: return "🎉"
        case .shopping: return "🛍️"
        case .spa: return "💆"
        }
    }

    /// The server's `domain` first; else the planning intent it already writes into `type`
    /// ("evening" → entertainment); else travel, the only area that had plan cards before v2.
    static func of(_ plan: TappyPlan) -> PlanArea {
        switch plan.domain?.trimmingCharacters(in: .whitespaces).lowercased() {
        case "travel", "hotel", "flight": return .travel
        case "food": return .food
        case "entertainment": return .entertainment
        case "shopping": return .shopping
        case "spa": return .spa
        default:
            return plan.type?.trimmingCharacters(in: .whitespaces).lowercased() == "evening" ? .entertainment : .travel
        }
    }
}

/// Image keys (owner 29/09): a background is `<mang>-<kieu>-N` (16:9, e.g. `du-lich-bien-1`), a stop type is
/// `diem-<loai>` (1:1, e.g. `diem-hai-san`). Lower-case ASCII, dash-separated — a key is a NAME, never a URL, so a
/// value that is not a well-formed key is treated as absent.
enum PlanImageKeys {
    private static let hero = try! NSRegularExpression(pattern: "^(du-lich|an-uong|giai-tri|mua-sam|spa)(-[a-z0-9]+)+-[0-9]+$")
    private static let stop = try! NSRegularExpression(pattern: "^diem(-[a-z0-9]+)+$")

    private static func matches(_ regex: NSRegularExpression, _ key: String?) -> Bool {
        guard let key else { return false }
        return regex.firstMatch(in: key, range: NSRange(key.startIndex..., in: key)) != nil
    }

    static func isHero(_ key: String?) -> Bool { matches(hero, key) }
    static func isStop(_ key: String?) -> Bool { matches(stop, key) }
    static func isKey(_ key: String?) -> Bool { isHero(key) || isStop(key) }

    /// The area a hero key names (`du-lich-bien-1` → travel), for its placeholder gradient.
    static func area(of key: String?) -> PlanArea? {
        guard isHero(key), let key else { return nil }
        return PlanArea.allCases.first { key.hasPrefix($0.slug + "-") }
    }
}

struct PlanCardModel: Equatable {
    /// Exactly what a stop without an amount reads (owner 29/09) — in Vietnamese in every language, as on Android.
    static let noPrice = "chưa có giá — hỏi quán"
    /// At most this many "Điểm nổi bật" tiles (the sample's 2×2 grid).
    static let maxHighlights = 4

    let area: PlanArea
    /// Hero image key, or nil → placeholder.
    let heroKey: String?
    let title: String
    let destination: String?
    let duration: String?
    let people: Int?
    let tagline: String?
    let days: [Day]
    let overview: [OverviewRow]
    let highlights: [HighlightTile]

    struct Day: Equatable, Identifiable {
        let number: Int
        let label: String
        let title: String?
        let stops: [Stop]
        var id: Int { number }
    }

    struct Stop: Equatable, Identifiable {
        let id: Int
        let time: String
        let imageKey: String?
        let emoji: String
        let name: String
        let description: String?
        let address: String?
        /// The server's amount, or `noPrice`.
        let price: String
        let priced: Bool
        let mapsLink: URL?
        let bookingLink: URL?
    }

    enum OverviewKind: Equatable { case destination, duration, people, budget }

    struct OverviewRow: Equatable, Identifiable {
        let kind: OverviewKind
        let value: String
        var sub: String? = nil
        var id: String { "\(kind)" }
    }

    struct HighlightTile: Equatable, Identifiable {
        let label: String
        let imageKey: String?
        var id: String { label }
    }

    /// The card for `plan`. Prices go through `PlanPrice` (the same projection the parser applies), so a sentinel
    /// like "chưa có giá" never lands in a price slot; a stop without an amount reads `noPrice`.
    static func of(_ plan: TappyPlan) -> PlanCardModel {
        let area = PlanArea.of(plan)
        var stopId = 0
        let days: [Day] = plan.days
            .map { day in (day, day.items.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }) }
            .filter { !$0.1.isEmpty }
            .enumerated()
            .map { index, pair -> Day in
                let (day, items) = pair
                return Day(
                    number: index + 1,
                    label: day.label.trimmingCharacters(in: .whitespaces),
                    title: day.title?.trimmingCharacters(in: .whitespaces).nilIfEmpty,
                    stops: items.map { item -> Stop in
                        defer { stopId += 1 }
                        let amount = PlanPrice.amount(item.price)
                        let address = item.address?.trimmingCharacters(in: .whitespaces)
                        return Stop(
                            id: stopId,
                            time: item.time.trimmingCharacters(in: .whitespaces),
                            imageKey: cleanKey(item.image),
                            emoji: item.emoji.isEmpty ? "📍" : item.emoji,
                            name: item.name.trimmingCharacters(in: .whitespaces),
                            description: item.description?.trimmingCharacters(in: .whitespaces).nilIfEmpty,
                            address: (address?.isEmpty == false && address != "Xem bản đồ") ? address : nil,
                            price: amount ?? noPrice,
                            priced: amount != nil,
                            mapsLink: httpsLink(item.mapsLink),
                            bookingLink: httpsLink(item.bookingLink))
                    })
            }

        let destination = plan.destination?.trimmingCharacters(in: .whitespaces).nilIfEmpty
        let duration = plan.duration?.trimmingCharacters(in: .whitespaces).nilIfEmpty
        let people = (plan.people ?? 0) > 0 ? plan.people : nil
        var overview: [OverviewRow] = []
        if let destination { overview.append(OverviewRow(kind: .destination, value: destination)) }
        if let duration { overview.append(OverviewRow(kind: .duration, value: duration)) }
        if let people { overview.append(OverviewRow(kind: .people, value: String(people))) }
        // Only the server's numbers: the total, and its per-person line when the server wrote one.
        if let budget = PlanPrice.amount(plan.budgetTotal) {
            overview.append(OverviewRow(kind: .budget, value: budget, sub: PlanPrice.amount(plan.budgetPerPerson)))
        }

        let tagline = (plan.tagline ?? plan.shareText)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return PlanCardModel(
            area: area,
            heroKey: PlanImageKeys.isHero(plan.heroImage?.trimmingCharacters(in: .whitespaces))
                ? plan.heroImage?.trimmingCharacters(in: .whitespaces) : nil,
            title: plan.title.trimmingCharacters(in: .whitespaces),
            destination: destination,
            duration: duration,
            people: people,
            tagline: tagline.flatMap { $0.isEmpty || $0.count > 160 || $0.contains("://") ? nil : $0 },
            days: days,
            overview: overview,
            highlights: (plan.highlights ?? [])
                .filter { !$0.label.trimmingCharacters(in: .whitespaces).isEmpty }
                .prefix(maxHighlights)
                .map { HighlightTile(label: $0.label.trimmingCharacters(in: .whitespaces), imageKey: cleanKey($0.image)) })
    }

    private static func cleanKey(_ raw: String?) -> String? {
        let key = raw?.trimmingCharacters(in: .whitespaces)
        return PlanImageKeys.isKey(key) ? key : nil
    }

    private static func httpsLink(_ raw: String?) -> URL? {
        guard let raw, raw.hasPrefix("https://") else { return nil }
        return URL(string: raw)
    }
}
