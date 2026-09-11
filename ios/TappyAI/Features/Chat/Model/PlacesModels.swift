import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// TWO PLACE PAYLOADS, DELIBERATELY DIFFERENT. Swift mirrors of the server's
// `PersistedRecommendation` (src/lib/recommendation/marker.ts) and `LivePlace`
// (src/lib/recommendation/liveView.ts), and of Android's `PlacesMarkerView.kt` /
// `PlacesLiveView.kt`.
//
//   `8:` annotation  → the LIVE card. Richer (categories, trade-offs, reference prices, hotel
//                      class), and NEVER stored: the chat saves `{role, content}` only, so it is
//                      gone on reload. Because it is not storage, no provider storage term applies
//                      to it — which is why it may carry the Google-sourced name, rating and hours
//                      that the durable payload has to drop.
//   `[TAPPY_PLACES]` → the DURABLE card. Rides in the message TEXT, the only channel that survives
//                      a save/reload round trip, and therefore the one bound by those terms.
//
// So a live card being richer than the card the same turn leaves behind after a reload is the
// designed outcome, not a defect — and the fix for the durable one is never to copy this payload
// into storage, nor to re-fetch on reload.
//
// Nothing here re-derives anything: every field is read straight from the server's projection.
// ─────────────────────────────────────────────────────────────────────────────

// MARK: - Durable: [TAPPY_PLACES]

struct PersistedPlaceAction: Codable, Equatable, Sendable, Identifiable {
    var kind: String = ""
    /// `direct` vs `search` — the honesty field, so a label cannot overpromise.
    var urlKind: String = ""
    var url: String = ""
    var labelKey: String = ""
    var platform: String?
    var attributed: Bool?

    var id: String { "\(kind)-\(url)" }
}

/// Why the server ranked a place where it did. Shown only when it said so.
struct PersistedPlaceReason: Codable, Equatable, Sendable {
    var attribute: String = ""
    var evidence: String = ""
}

struct PersistedPlace: Codable, Equatable, Sendable, Identifiable {
    var id: String = ""
    var domain: String = ""
    var kind: String = ""
    var rank: Int = 0
    var name: String?
    var image: String?
    var address: String?
    var rating: Double?
    var ratingCount: Int?
    var openingHours: String?
    var openNow: Bool?
    var phone: String?
    var priceLevel: Int?
    var distanceKm: Double?
    var shortlistPosition: Int?
    var recommended: Bool?
    var matchVerdict: String?
    var reasons: [PersistedPlaceReason] = []
    var actions: [PersistedPlaceAction] = []
}

/// The block envelope.
///
/// `v` IS READ BUT NOT ENFORCED. Web is the reference implementation and decodes any payload
/// carrying a non-empty `items`, whatever the version says — so gating on `v` here would mean a
/// server version bump silently blanked the card on iOS while web kept working. The shared fixture
/// `places-unknown-version` pins that, and unknown FIELDS are tolerated the same way, by
/// `JSONDecoder` ignoring keys the model does not declare.
struct PlacesMarkerPayload: Codable, Equatable, Sendable {
    var v: Int = 1
    var items: [PersistedPlace] = []
}

// MARK: - Live: the `8:` annotation

struct LivePlaceAction: Codable, Equatable, Sendable {
    var kind: String = ""
    var urlKind: String = ""
    var url: String = ""
    var labelKey: String = ""
    var platform: String?
    var attributed: Bool?
}

struct LivePlaceReason: Codable, Equatable, Sendable {
    var attribute: String = ""
    var evidence: String = ""
}

struct LivePlace: Codable, Equatable, Sendable {
    var id: String = ""
    var domain: String = ""
    var kind: String = ""
    var name: String = ""
    var image: String?
    var address: String?
    var rating: Double?
    var ratingCount: Int?
    /// Hotel CLASS, 1-5 — never a guest rating. Carried separately so the card cannot confuse them.
    var stars: Int?
    var openingHours: String?
    var openNow: Bool?
    var phone: String?
    var priceLevel: Int?
    /// A price seen in a search snippet. Weak evidence — the card labels it as reference.
    var priceSignal: String?
    var distanceKm: Double?
    var categories: [String] = []
    var flags: [String] = []
    var rank: Int = 0
    var shortlistPosition: Int?
    var recommended: Bool?
    var matchVerdict: String?
    var reasons: [LivePlaceReason] = []
    var tradeOff: LivePlaceReason?
    var actions: [LivePlaceAction] = []
}

struct PlacesLiveView: Codable, Equatable, Sendable {
    var kind: String = ""
    var v: Int = 1
    var domain: String = ""
    /// Whether the engine actually RANKED this set. False when rows were retrieved but nothing in
    /// them was scoreable, so the order is the provider's and no position means anything.
    var ranked: Bool?
    var items: [LivePlace] = []
    var mapsSearchUrl: String?
}

/// The annotation's own type tag, verbatim from the server (`liveView.ts`). Checked before the
/// payload is used so a DIFFERENT annotation riding the same `8:` part can never be mistaken for a
/// place decision — the frame is shared, the kind is what identifies it.
let placesAnnotationKind = "tappy.places.v1"

// MARK: - What a card actually draws

/// ONE card, TWO payloads.
///
/// The live annotation and the durable marker are different projections of the same recommendation.
/// Rendering them through two views would guarantee they drifted — the live card gaining a row the
/// reloaded one never gets, or the two disagreeing about which place is "popular". So both are
/// mapped into this shape and there is exactly one card, on all three platforms.
///
/// Fields the durable payload cannot carry (a trade-off, a reference price, provider categories,
/// hotel class) are simply nil on that path, and every row is conditional, so the same card renders
/// the richer live version and the thinner stored one without a placeholder anywhere.
struct PlaceCardView: Equatable, Sendable, Identifiable {
    var id: String
    var name: String
    var rank: Int
    var image: String?
    var address: String?
    var rating: Double?
    var ratingCount: Int?
    var stars: Int?
    var openingHours: String?
    var openNow: Bool?
    var priceLevel: Int?
    var priceSignal: String?
    var distanceKm: Double?
    var categories: [String] = []
    var reasons: [String] = []
    var tradeOff: String?
    var actions: [PersistedPlaceAction] = []
}

extension LivePlace {
    /// The LIVE projection → the card. Nothing is dropped that the card can show.
    func toCardView() -> PlaceCardView {
        PlaceCardView(
            id: id,
            name: name,
            rank: rank,
            image: image,
            address: address,
            rating: rating,
            ratingCount: ratingCount,
            stars: stars,
            openingHours: openingHours,
            openNow: openNow,
            priceLevel: priceLevel,
            priceSignal: priceSignal,
            distanceKm: distanceKm,
            categories: categories,
            reasons: reasons.map(\.evidence).filter { !$0.isEmpty },
            tradeOff: tradeOff.map(\.evidence).flatMap { $0.isEmpty ? nil : $0 },
            actions: actions.map {
                PersistedPlaceAction(
                    kind: $0.kind, urlKind: $0.urlKind, url: $0.url,
                    labelKey: $0.labelKey, platform: $0.platform, attributed: $0.attributed
                )
            }
        )
    }
}

extension PersistedPlace {
    /// The DURABLE projection → the same card.
    ///
    /// A place whose name the server could not persist (Google-sourced content) has nothing a
    /// reader could identify it by, so it yields nil and no card is drawn for it. That is a
    /// licensing outcome, not a gap to fill: the prose above still describes the place, and
    /// re-fetching to complete the card is exactly what the storage terms forbid.
    func toCardView() -> PlaceCardView? {
        guard let known = name?.trimmingCharacters(in: .whitespacesAndNewlines), !known.isEmpty else {
            return nil
        }
        return PlaceCardView(
            id: id,
            name: known,
            rank: rank,
            image: image,
            address: address,
            rating: rating,
            ratingCount: ratingCount,
            openingHours: openingHours,
            openNow: openNow,
            priceLevel: priceLevel,
            distanceKm: distanceKm,
            reasons: reasons.map(\.evidence).filter { !$0.isEmpty },
            actions: actions
        )
    }
}

// MARK: - Tolerant decoding

// 🚨 SWIFT NEEDS THIS AND THE OTHER TWO PLATFORMS DO NOT.
//
// A synthesised `Decodable` calls `decode(_:forKey:)` for every non-optional property and THROWS
// when the key is absent — a default value does not rescue it. kotlinx.serialization honours
// defaults and JavaScript simply reads `undefined`, so a payload that omits a field decodes fine on
// Android and Web and would blank the card on iOS alone. That is exactly the drift the shared
// fixtures exist to catch (`places-unknown-fields`, `places-unknown-version`), and this is the
// repository's existing answer to it — see `ShoppingEntityView`.
//
// A field the server omitted must not fail the whole payload, and must never acquire a value:
// optionals stay nil, and only structural fields get a neutral fallback.
//
// Written in EXTENSIONS, not in the struct bodies, so the memberwise initialisers survive — a
// custom `init` in the body silently removes them, which `V3_IOS_VERIFICATION_PLAN.md §2.1` names
// as one of the two failures most likely to appear first on this platform.

extension PersistedPlaceAction {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            kind: (try? c.decode(String.self, forKey: .kind)) ?? "",
            urlKind: (try? c.decode(String.self, forKey: .urlKind)) ?? "",
            url: (try? c.decode(String.self, forKey: .url)) ?? "",
            labelKey: (try? c.decode(String.self, forKey: .labelKey)) ?? "",
            platform: try? c.decode(String.self, forKey: .platform),
            attributed: try? c.decode(Bool.self, forKey: .attributed)
        )
    }
}

extension PersistedPlaceReason {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            attribute: (try? c.decode(String.self, forKey: .attribute)) ?? "",
            evidence: (try? c.decode(String.self, forKey: .evidence)) ?? ""
        )
    }
}

extension PersistedPlace {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: (try? c.decode(String.self, forKey: .id)) ?? "",
            domain: (try? c.decode(String.self, forKey: .domain)) ?? "",
            kind: (try? c.decode(String.self, forKey: .kind)) ?? "",
            rank: (try? c.decode(Int.self, forKey: .rank)) ?? 0,
            name: try? c.decode(String.self, forKey: .name),
            image: try? c.decode(String.self, forKey: .image),
            address: try? c.decode(String.self, forKey: .address),
            rating: try? c.decode(Double.self, forKey: .rating),
            ratingCount: try? c.decode(Int.self, forKey: .ratingCount),
            openingHours: try? c.decode(String.self, forKey: .openingHours),
            openNow: try? c.decode(Bool.self, forKey: .openNow),
            phone: try? c.decode(String.self, forKey: .phone),
            priceLevel: try? c.decode(Int.self, forKey: .priceLevel),
            distanceKm: try? c.decode(Double.self, forKey: .distanceKm),
            shortlistPosition: try? c.decode(Int.self, forKey: .shortlistPosition),
            recommended: try? c.decode(Bool.self, forKey: .recommended),
            matchVerdict: try? c.decode(String.self, forKey: .matchVerdict),
            reasons: (try? c.decode([PersistedPlaceReason].self, forKey: .reasons)) ?? [],
            actions: (try? c.decode([PersistedPlaceAction].self, forKey: .actions)) ?? []
        )
    }
}

extension PlacesMarkerPayload {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            v: (try? c.decode(Int.self, forKey: .v)) ?? 1,
            items: (try? c.decode([PersistedPlace].self, forKey: .items)) ?? []
        )
    }
}

extension LivePlaceAction {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            kind: (try? c.decode(String.self, forKey: .kind)) ?? "",
            urlKind: (try? c.decode(String.self, forKey: .urlKind)) ?? "",
            url: (try? c.decode(String.self, forKey: .url)) ?? "",
            labelKey: (try? c.decode(String.self, forKey: .labelKey)) ?? "",
            platform: try? c.decode(String.self, forKey: .platform),
            attributed: try? c.decode(Bool.self, forKey: .attributed)
        )
    }
}

extension LivePlaceReason {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            attribute: (try? c.decode(String.self, forKey: .attribute)) ?? "",
            evidence: (try? c.decode(String.self, forKey: .evidence)) ?? ""
        )
    }
}

extension LivePlace {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            id: (try? c.decode(String.self, forKey: .id)) ?? "",
            domain: (try? c.decode(String.self, forKey: .domain)) ?? "",
            kind: (try? c.decode(String.self, forKey: .kind)) ?? "",
            name: (try? c.decode(String.self, forKey: .name)) ?? "",
            image: try? c.decode(String.self, forKey: .image),
            address: try? c.decode(String.self, forKey: .address),
            rating: try? c.decode(Double.self, forKey: .rating),
            ratingCount: try? c.decode(Int.self, forKey: .ratingCount),
            stars: try? c.decode(Int.self, forKey: .stars),
            openingHours: try? c.decode(String.self, forKey: .openingHours),
            openNow: try? c.decode(Bool.self, forKey: .openNow),
            phone: try? c.decode(String.self, forKey: .phone),
            priceLevel: try? c.decode(Int.self, forKey: .priceLevel),
            priceSignal: try? c.decode(String.self, forKey: .priceSignal),
            distanceKm: try? c.decode(Double.self, forKey: .distanceKm),
            categories: (try? c.decode([String].self, forKey: .categories)) ?? [],
            flags: (try? c.decode([String].self, forKey: .flags)) ?? [],
            rank: (try? c.decode(Int.self, forKey: .rank)) ?? 0,
            shortlistPosition: try? c.decode(Int.self, forKey: .shortlistPosition),
            recommended: try? c.decode(Bool.self, forKey: .recommended),
            matchVerdict: try? c.decode(String.self, forKey: .matchVerdict),
            reasons: (try? c.decode([LivePlaceReason].self, forKey: .reasons)) ?? [],
            tradeOff: try? c.decode(LivePlaceReason.self, forKey: .tradeOff),
            actions: (try? c.decode([LivePlaceAction].self, forKey: .actions)) ?? []
        )
    }
}

extension PlacesLiveView {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            kind: (try? c.decode(String.self, forKey: .kind)) ?? "",
            v: (try? c.decode(Int.self, forKey: .v)) ?? 1,
            domain: (try? c.decode(String.self, forKey: .domain)) ?? "",
            ranked: try? c.decode(Bool.self, forKey: .ranked),
            items: (try? c.decode([LivePlace].self, forKey: .items)) ?? [],
            mapsSearchUrl: try? c.decode(String.self, forKey: .mapsSearchUrl)
        )
    }
}
