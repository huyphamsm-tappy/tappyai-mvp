import Foundation

// The place decision's pure rules — the filter chips, the fold, the action order. A port of Android's
// `PlaceCard.kt` (`placeFilters`, `carouselPlaces`, `foldedPlaces`, `showsFilterRow`, `groupActions`) and
// web's `PlaceDecision.tsx`; kept free of SwiftUI so each rule is unit-tested on its own.

/// Web `filterRated`: a rating this high is what the «Đánh giá cao» chip means.
let placeRatedMin = 4.5

/// How many merchants the carousel pages through before the chip row must show the count (web `VISIBLE`).
let placesVisible = 3

enum PlaceFilterId: String, CaseIterable, Sendable {
    case all, open, rated, wifi, outdoor, vegetarian

    /// Catalogue key of the chip label (`place.filter.all` takes the total).
    var labelKey: String {
        switch self {
        case .all: return "place.filter.all"
        case .open: return "place.filter.open"
        case .rated: return "place.filter.rated"
        case .wifi: return "place.flag.wifi"
        case .outdoor: return "place.flag.outdoor"
        case .vegetarian: return "place.flag.vegetarian"
        }
    }

    func matches(_ place: PlaceCardView) -> Bool {
        switch self {
        case .all: return true
        case .open: return place.openNow == true
        case .rated: return (place.rating ?? 0) >= placeRatedMin
        case .wifi: return place.flags.contains("wifi")
        case .outdoor: return place.flags.contains("outdoorSeating")
        case .vegetarian: return place.flags.contains("vegetarian")
        }
    }
}

/// The filter row, derived from the rows themselves. `all` is always first; every other chip is offered only
/// when it would change the result — at least one row matches and at least one does not.
func placeFilters(_ items: [PlaceCardView]) -> [PlaceFilterId] {
    let useful = PlaceFilterId.allCases.filter { id in
        guard id != .all else { return false }
        let n = items.filter(id.matches).count
        return n > 0 && n < items.count
    }
    return [.all] + useful
}

/// Every row the chip admits, in SERVER order — nothing is cut at three.
func carouselPlaces(_ items: [PlaceCardView], filter: PlaceFilterId) -> [PlaceCardView] {
    items.filter(filter.matches)
}

/// The cards above the fold. With `shown` set, the «all» chip active and the fold closed, only the first
/// `shown` cards page; a chip shows every admitted row. `hidden` counts what «Xem thêm N chỗ» would reveal.
func foldedPlaces(_ items: [PlaceCardView], shown: Int?, expanded: Bool, filter: PlaceFilterId) -> (pages: [PlaceCardView], hidden: Int) {
    let folded: Bool
    if let shown, shown > 0, !expanded, filter == .all, items.count > shown { folded = true } else { folded = false }
    guard folded, let shown else { return (carouselPlaces(items, filter: filter), 0) }
    let hidden = items.dropFirst(shown).filter(filter.matches).count
    return (carouselPlaces(Array(items.prefix(shown)), filter: filter), hidden)
}

/// The chip row shows when a chip can change the result, and also when the payload holds more rows than the
/// carousel pages through — the count is then the honest answer to «is this all of them?».
func showsPlaceFilterRow(_ items: [PlaceCardView], filters: [PlaceFilterId]) -> Bool {
    filters.count > 1 || items.count > placesVisible
}

/// The actions that DO the thing (web `BOOK_KINDS`).
let placeBookKinds: Set<String> = ["order", "delivery", "booking", "reservation", "ticket", "purchase"]

struct GroupedPlaceActions: Equatable {
    var lead: PersistedPlaceAction?
    var maps: PersistedPlaceAction?
    var books: [PersistedPlaceAction]
    var others: [PersistedPlaceAction]

    /// Render order (owner 2026-09-17: commerce / affiliate CTA before Maps): lead, books, maps, the rest.
    var ordered: [PersistedPlaceAction] { (lead.map { [$0] } ?? []) + books + (maps.map { [$0] } ?? []) + others }
}

/// An action with no URL is not a button — it is dropped. Grouping is by `kind`, exactly as Android and web.
func groupPlaceActions(_ actions: [PersistedPlaceAction]) -> GroupedPlaceActions {
    let usable = actions.filter { !$0.url.isEmpty }
    let lead = usable.first { $0.commerce?.primary == true }
    let maps = usable.first { $0.id != lead?.id && ($0.kind == "maps" || $0.kind == "directions") }
    let books = usable.filter { $0.id != lead?.id && $0.id != maps?.id && placeBookKinds.contains($0.kind) }
    let bookIds = Set(books.map(\.id))
    let others = usable.filter { $0.id != lead?.id && $0.id != maps?.id && !bookIds.contains($0.id) }
    return GroupedPlaceActions(lead: lead, maps: maps, books: books, others: others)
}

// MARK: - Action labels (a port of Android `actionLabelSpec` / `platformOf`, web `resolveActionLabel`)

/// Which catalogue entry a NON-commerce action reads, and the merchant it names. Keyed on `kind`, `urlKind`
/// and `attributed` exactly as Android and web are — the wire's `labelKey` is not what they show for these.
/// A commerce handoff keeps its server-resolved key (`placeActionLabel`).
struct PlaceActionSpec: Equatable {
    let key: String
    let platform: String?

    var text: String {
        let format = NSLocalizedString(key, comment: "")
        if let platform { return String(format: format, platform) }
        return format
    }
}

private let placeHostBrands: [(pattern: String, brand: String)] = [
    (#"(^|\.)youtube\.com$|(^|\.)youtu\.be$"#, "YouTube"),
    (#"(^|\.)tiktok\.com$"#, "TikTok"),
    (#"(^|\.)google\."#, "Google"),
    (#"(^|\.)shopee\."#, "Shopee"),
    (#"(^|\.)lazada\."#, "Lazada"),
    (#"(^|\.)tiki\.vn$"#, "Tiki"),
    (#"(^|\.)shopeefood\."#, "ShopeeFood"),
    (#"(^|\.)grab\.com$"#, "GrabFood"),
    (#"(^|\.)be\.com\.vn$"#, "BeFood"),
    (#"(^|\.)booking\.com$"#, "Booking.com"),
    (#"(^|\.)agoda\."#, "Agoda"),
    (#"(^|\.)facebook\.com$"#, "Facebook"),
    (#"(^|\.)vexere\."#, "Vexere"),
]

/// The action's own `platform`, else the brand its host names, else the host's first label capitalised.
/// `tel:` and anything unparseable name nothing.
func placePlatform(of action: PersistedPlaceAction) -> String? {
    if let p = action.platform, !p.trimmingCharacters(in: .whitespaces).isEmpty { return p }
    guard var host = URL(string: action.url)?.host?.lowercased(), !host.isEmpty else { return nil }
    if host.hasPrefix("www.") { host.removeFirst(4) }
    for (pattern, brand) in placeHostBrands where host.range(of: pattern, options: .regularExpression) != nil { return brand }
    guard let first = host.split(separator: ".").first, !first.isEmpty else { return nil }
    return first.prefix(1).uppercased() + first.dropFirst()
}

func placeActionSpec(_ action: PersistedPlaceAction) -> PlaceActionSpec {
    let platform = placePlatform(of: action)
    func with(_ key: String, fallback: String) -> PlaceActionSpec {
        platform != nil ? PlaceActionSpec(key: key, platform: platform) : PlaceActionSpec(key: fallback, platform: nil)
    }
    if action.kind == "review" {
        return action.attributed == true
            ? with("place.action.reviewOn", fallback: "place.action.review")
            : with("place.action.reviewSearchOn", fallback: "place.action.reviewSearchGeneric")
    }
    if action.urlKind == "search" {
        switch action.kind {
        case "booking", "reservation": return with("place.action.bookingSearch", fallback: "place.action.searchGeneric")
        case "ticket": return with("place.action.ticketSearch", fallback: "place.action.searchGeneric")
        default: return with("place.action.searchOn", fallback: "place.action.searchGeneric")
        }
    }
    let plain: String
    switch action.kind {
    case "maps": plain = "place.action.maps"
    case "directions": plain = "place.action.directions"
    case "call": plain = "place.action.call"
    case "order": plain = "place.action.order"
    case "delivery": plain = "place.action.delivery"
    case "booking": plain = "place.action.booking"
    case "reservation": plain = "place.action.reservation"
    case "ticket": plain = "place.action.ticket"
    case "purchase": plain = "place.action.purchase"
    case "social": plain = "place.action.social"
    default: plain = "place.action.website"
    }
    return PlaceActionSpec(key: plain, platform: nil)
}
