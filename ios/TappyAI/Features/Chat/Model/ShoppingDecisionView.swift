import Foundation

/// D1 — the shopping DECISION, as it arrives inside `[TAPPY_SHOPPING]`.
///
/// Swift mirror of web's `SynthesisView` (src/lib/ai/consultative/synthesisView.ts) and of
/// Android's `ShoppingDecisionView.kt`. The server serialises that view straight into the marker,
/// so this is the wire shape rather than a re-derivation: the config label, price range, match
/// verdict and recommended flag are EXACTLY what the model was told, which is why the card can
/// never disagree with the prose above it.
///
/// iOS decoded none of this before — `stripMarkerResidue` removed the block and threw it away, so
/// a user on a shopping turn read the prose and silently lost the recommendation, the price
/// ranges, the match verdicts and every alternative (V3_PLATFORM_PARITY.md D1).
///
/// 🚨 THE HONESTY RULE IS IN THE TYPES. Every field the server may not know is optional, and the
/// view renders nil as an explicit "chưa rõ". Nothing is defaulted to a plausible-looking value,
/// because a fabricated price is worse than an absent one.

struct ShoppingOfferView: Codable, Equatable, Sendable {
    let seller: String?
    let url: String?
    let price: Double?
    let currency: String?
    let condition: String?
}

/// A Commerce Link the platform attached to a product entity (web `SynthesisCommerceView`,
/// src/lib/ai/consultative/synthesisView.ts; Android `ShoppingCommerceView`). The Shopping card
/// renders from the `[TAPPY_SHOPPING]` marker rather than the live place view, so the same
/// canonical handoff is projected here with the same facts: merchant, depth, login boundary, the
/// RESOLVED `labelKey` and the opaque ids the handoff beacon reports.
///
/// 🚨 iOS DECODED NONE OF THIS BEFORE. `commerceLinks` was an unknown key and was ignored, so
/// "Mua iPhone trên TikTok Shop" showed the web its TikTok Shop handoff and showed the phone a
/// Google Shopping redirect list. Same marker, two merchants — the drift the shared fixtures pin.
struct ShoppingCommerceView: Codable, Equatable, Sendable, Identifiable {
    var linkId: String = ""
    var requestId: String = ""
    var providerId: String = ""
    var merchantName: String = ""
    var url: String = ""
    var depth: Int = 0
    var guestDepth: Int = 0
    var authRequiredAt: String = ""
    var loginRequired: Bool = false
    var freshnessType: String = ""
    var expiresAt: String?
    var tracked: Bool = false
    var capability: String?
    var primary: Bool = true
    /// `SEARCH_HANDOFF` (the merchant's search for the user's words) vs a detail / checkout handoff.
    var kind: String = ""
    /// The RESOLVED label key. Nil on a marker written before the field existed (see `labelKeyOrFallback`).
    var labelKey: String?
    var handoff: String?
    var authenticatedDepth: Int?
    var facts: LiveCommerceObservedFacts?

    var id: String { linkId.isEmpty ? url : linkId }
    var isSearch: Bool { kind == "SEARCH_HANDOFF" }

    /// A marker persisted before the server projected `labelKey` still renders an honest label: a
    /// search says "search on", a detail handoff says "view on" — never a stronger verb than the
    /// server chose (the resolver on the server is the only thing allowed to promise a purchase).
    var labelKeyOrFallback: String { labelKey ?? (isSearch ? "v3.action.searchOn" : "v3.action.viewOn") }

    /// The same action shape the live place card renders, so one label resolver serves both.
    var asPlaceCardAction: PersistedPlaceAction {
        PersistedPlaceAction(
            kind: "purchase",
            urlKind: isSearch ? "search" : "direct",
            url: url,
            labelKey: labelKeyOrFallback,
            platform: merchantName,
            attributed: nil,
            commerce: LiveCommerceFacts(
                linkId: linkId, requestId: requestId, providerId: providerId, depth: depth, guestDepth: guestDepth,
                authRequiredAt: authRequiredAt, loginRequired: loginRequired, handoff: handoff,
                authenticatedDepth: authenticatedDepth, freshnessType: freshnessType, expiresAt: expiresAt,
                tracked: tracked, capability: capability, primary: primary, facts: facts
            )
        )
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        linkId = (try? c.decode(String.self, forKey: .linkId)) ?? ""
        requestId = (try? c.decode(String.self, forKey: .requestId)) ?? ""
        providerId = (try? c.decode(String.self, forKey: .providerId)) ?? ""
        merchantName = (try? c.decode(String.self, forKey: .merchantName)) ?? ""
        url = (try? c.decode(String.self, forKey: .url)) ?? ""
        depth = (try? c.decode(Int.self, forKey: .depth)) ?? 0
        guestDepth = (try? c.decode(Int.self, forKey: .guestDepth)) ?? 0
        authRequiredAt = (try? c.decode(String.self, forKey: .authRequiredAt)) ?? ""
        loginRequired = (try? c.decode(Bool.self, forKey: .loginRequired)) ?? false
        freshnessType = (try? c.decode(String.self, forKey: .freshnessType)) ?? ""
        expiresAt = try? c.decode(String.self, forKey: .expiresAt)
        tracked = (try? c.decode(Bool.self, forKey: .tracked)) ?? false
        capability = try? c.decode(String.self, forKey: .capability)
        primary = (try? c.decode(Bool.self, forKey: .primary)) ?? true
        kind = (try? c.decode(String.self, forKey: .kind)) ?? ""
        labelKey = try? c.decode(String.self, forKey: .labelKey)
        handoff = try? c.decode(String.self, forKey: .handoff)
        authenticatedDepth = try? c.decode(Int.self, forKey: .authenticatedDepth)
        facts = try? c.decode(LiveCommerceObservedFacts.self, forKey: .facts)
    }

    init(url: String, merchantName: String, kind: String, labelKey: String? = nil, linkId: String = "", requestId: String = "", providerId: String = "") {
        self.url = url
        self.merchantName = merchantName
        self.kind = kind
        self.labelKey = labelKey
        self.linkId = linkId
        self.requestId = requestId
        self.providerId = providerId
    }
}

/// The handoffs the card shows, split the way web splits them (`handoffsOf`,
/// components/chat/ShoppingDecision.tsx): DETAIL links are the buttons; the marketplaces' SEARCH
/// fallbacks are offered only when the entity has no detail link at all.
struct ShoppingCommerceHandoffs: Equatable, Sendable {
    let detail: [ShoppingCommerceView]
    let search: [ShoppingCommerceView]
    var isEmpty: Bool { detail.isEmpty && search.isEmpty }
}

/// One product configuration the assistant considered.
struct ShoppingEntityView: Codable, Equatable, Sendable, Identifiable {
    let key: String
    let config: String
    /// `khop` = matches the request · `khac` = differs · `chua_ro` = not enough information.
    let matchesRequest: String
    let recommended: Bool
    let priceLow: Double?
    let priceHigh: Double?
    /// A representative product photo, if any offer carried one.
    let image: String?
    let offers: [ShoppingOfferView]
    /// The entity's leading DETAIL handoff (a stored marker from before `commerceLinks` carries only this).
    let commerce: ShoppingCommerceView?
    /// Every Commerce Link CCP attached, in CCP's ranking order.
    let commerceLinks: [ShoppingCommerceView]?

    var id: String { key }

    var commerceHandoffs: ShoppingCommerceHandoffs {
        let all = commerceLinks ?? (commerce.map { [$0] } ?? [])
        let detail = Array(all.filter { !$0.isSearch }.prefix(5))
        let search = detail.isEmpty ? Array(all.filter { $0.isSearch }.prefix(2)) : []
        return ShoppingCommerceHandoffs(detail: detail, search: search)
    }

    /// Restores the memberwise initialiser that `init(from:)` below suppresses.
    init(
        key: String,
        config: String,
        matchesRequest: String,
        recommended: Bool = false,
        priceLow: Double? = nil,
        priceHigh: Double? = nil,
        image: String? = nil,
        offers: [ShoppingOfferView] = [],
        commerce: ShoppingCommerceView? = nil,
        commerceLinks: [ShoppingCommerceView]? = nil
    ) {
        self.key = key
        self.config = config
        self.matchesRequest = matchesRequest
        self.recommended = recommended
        self.priceLow = priceLow
        self.priceHigh = priceHigh
        self.image = image
        self.offers = offers
        self.commerce = commerce
        self.commerceLinks = commerceLinks
    }

    // Defaults on decode: a field the server omitted must not fail the whole decision, but it must
    // also never acquire a value. Optionals stay nil; only identity and the closed-set verdict get
    // a fallback, and the verdict falls back to "unknown" rather than to a claim.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = (try? c.decode(String.self, forKey: .key)) ?? UUID().uuidString
        config = (try? c.decode(String.self, forKey: .config)) ?? ""
        matchesRequest = (try? c.decode(String.self, forKey: .matchesRequest)) ?? ShoppingMatch.unknown
        recommended = (try? c.decode(Bool.self, forKey: .recommended)) ?? false
        priceLow = try? c.decode(Double.self, forKey: .priceLow)
        priceHigh = try? c.decode(Double.self, forKey: .priceHigh)
        image = try? c.decode(String.self, forKey: .image)
        offers = (try? c.decode([ShoppingOfferView].self, forKey: .offers)) ?? []
        commerce = try? c.decode(ShoppingCommerceView.self, forKey: .commerce)
        commerceLinks = try? c.decode([ShoppingCommerceView].self, forKey: .commerceLinks)
    }
}

struct ShoppingReason: Codable, Equatable, Sendable {
    let attribute: String
    let evidence: String
}

/// Why the server recommends what it recommends. A recommendation without reasons is not shown.
struct ShoppingRecommendationView: Codable, Equatable, Sendable {
    let entityKey: String?
    let seller: String?
    let reasons: [ShoppingReason]
    let tradeOff: ShoppingReason?
    let conditional: Bool

    /// Restores the memberwise initialiser that `init(from:)` below suppresses.
    init(
        entityKey: String?,
        seller: String? = nil,
        reasons: [ShoppingReason] = [],
        tradeOff: ShoppingReason? = nil,
        conditional: Bool = false
    ) {
        self.entityKey = entityKey
        self.seller = seller
        self.reasons = reasons
        self.tradeOff = tradeOff
        self.conditional = conditional
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        entityKey = try? c.decode(String.self, forKey: .entityKey)
        seller = try? c.decode(String.self, forKey: .seller)
        reasons = (try? c.decode([ShoppingReason].self, forKey: .reasons)) ?? []
        tradeOff = try? c.decode(ShoppingReason.self, forKey: .tradeOff)
        conditional = (try? c.decode(Bool.self, forKey: .conditional)) ?? false
    }
}

struct ShoppingDecisionView: Codable, Equatable, Sendable {
    let v: Int
    let entities: [ShoppingEntityView]
    let recommendation: ShoppingRecommendationView?

    /// Declaring `init(from:)` below suppresses Swift's synthesised memberwise initialiser, so it
    /// is restored explicitly. Tests and previews construct these values directly.
    init(v: Int = 1, entities: [ShoppingEntityView], recommendation: ShoppingRecommendationView? = nil) {
        self.v = v
        self.entities = entities
        self.recommendation = recommendation
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        v = (try? c.decode(Int.self, forKey: .v)) ?? 1
        entities = (try? c.decode([ShoppingEntityView].self, forKey: .entities)) ?? []
        recommendation = try? c.decode(ShoppingRecommendationView.self, forKey: .recommendation)
    }
}

/// Match verdicts the server can emit. A closed set, so the UI cannot invent a fourth.
enum ShoppingMatch {
    static let exact = "khop"
    static let different = "khac"
    static let unknown = "chua_ro"
}

/// A price range, a single bound, or an explicit unknown.
///
/// Free function because this is where the honesty rule is easiest to break: an empty string, a
/// "0đ", or a low bound presented as a range would each be a claim the server never made.
func shoppingPriceRangeText(low: Double?, high: Double?, unknown: String) -> String {
    func compact(_ amount: Double) -> String {
        let v = Int(amount)
        if v >= 1_000_000 {
            let millions = v / 1_000_000
            let remainder = (v % 1_000_000) / 100_000
            return remainder > 0 ? "\(millions).\(remainder) triệu" : "\(millions) triệu"
        }
        return "\(v / 1000)k"
    }
    switch (low, high) {
    case let (l?, h?) where l != h: return "\(compact(l)) – \(compact(h))"
    case let (l?, _): return compact(l)
    case let (_, h?): return compact(h)
    default: return unknown
    }
}
