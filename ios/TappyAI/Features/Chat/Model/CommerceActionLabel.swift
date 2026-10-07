import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// The label a place-card action renders, resolved from the key the SERVER decided.
//
// Cross-platform CCP contract (14 Sep 2026): the server's one label resolver
// (`resolveActionLabel`, src/lib/recommendation/actionLabel.ts) turns (kind, urlKind, url,
// platform, attributed, commerce) into ONE key — "Mua trên TikTok Shop · cần đăng nhập" is
// `v3.action.purchaseLoginOn` + platform — and projects that key on the wire. This file only maps
// the key to a catalogue entry; it never looks at the URL, the depth or the login boundary to decide
// what to promise. Swift twin of Android's `CommerceActionLabel.kt`; the shared fixture
// (`shared/ccp/commerce-action-fixtures.json`) pins all three renderers to the same key set.
//
// 🚨 A key this app version has never seen falls back to a generic "Open" (or "Search on …" for a
// search) rather than rendering the raw key — never to a stronger verb.
// ─────────────────────────────────────────────────────────────────────────────

struct PlaceActionLabel: Equatable {
    /// The `Localizable.xcstrings` key.
    let key: String
    /// The merchant interpolated into it (`%@`), when the key takes one.
    let platform: String?

    var text: String {
        let format = String(localized: String.LocalizationValue(key))
        if let platform { return String(format: format, platform) }
        return format
    }
}

/// Keys that take the merchant name. The server only emits one of these when it knows the platform.
private let platformKeys: Set<String> = [
    "searchOn", "searchLoginOn", "bookingSearch", "ticketSearch", "orderSearch", "viewOn",
    "purchaseOn", "purchaseLoginOn", "purchaseAppOn",
    "bookingOn", "bookingLoginOn", "bookingAppOn",
    "reservationOn", "reservationLoginOn", "reservationAppOn",
    "ticketOn", "ticketLoginOn", "ticketAppOn",
    "orderOn", "orderLoginOn", "orderAppOn",
    "deliveryOn", "deliveryLoginOn", "deliveryAppOn",
]

/// Plain keys (no merchant), and the search family's platform-less sibling.
private let plainKeys: [String: String] = [
    "maps": "place.action.maps",
    "directions": "place.action.directions",
    "website": "place.action.website",
    "order": "place.action.order",
    "delivery": "place.action.delivery",
    "booking": "place.action.booking",
    "reservation": "place.action.reservation",
    "ticket": "place.action.ticket",
    "purchase": "place.action.purchase",
    "call": "place.action.call",
    "review": "place.action.review",
    "reviewSearch": "place.action.review",
    "reviewSearchGeneric": "place.action.review",
    "social": "place.action.social",
    "searchGeneric": "place.action.searchGeneric",
    "search": "place.action.searchGeneric",
    "bookingSearch": "place.action.searchGeneric",
    "ticketSearch": "place.action.searchGeneric",
    "orderSearch": "place.action.searchGeneric",
]

func placeActionLabel(labelKey: String, urlKind: String, platform: String?) -> PlaceActionLabel {
    let leaf = labelKey.split(separator: ".").last.map(String.init) ?? ""
    let named = platform.flatMap { $0.isEmpty ? nil : $0 }

    if let named {
        if platformKeys.contains(leaf) { return PlaceActionLabel(key: "place.action.\(leaf)", platform: named) }
        if leaf == "reviewOn" || leaf == "reviewSearch" { return PlaceActionLabel(key: "place.action.review", platform: nil) }
    }

    // A platform key that arrived without its platform keeps the plain verb, as web does.
    var base = leaf
    for suffix in ["LoginOn", "AppOn", "On"] where base.hasSuffix(suffix) {
        base = String(base.dropLast(suffix.count))
        break
    }
    if let plain = plainKeys[base] { return PlaceActionLabel(key: plain, platform: nil) }

    // Unknown key: a search with a platform is still honestly "Search on X"; anything else is "Open".
    if urlKind == "search", let named { return PlaceActionLabel(key: "place.action.searchOn", platform: named) }
    return PlaceActionLabel(key: "place.action.open", platform: nil)
}
