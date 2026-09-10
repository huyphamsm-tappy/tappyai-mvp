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

    var id: String { key }

    /// Restores the memberwise initialiser that `init(from:)` below suppresses.
    init(
        key: String,
        config: String,
        matchesRequest: String,
        recommended: Bool = false,
        priceLow: Double? = nil,
        priceHigh: Double? = nil,
        image: String? = nil,
        offers: [ShoppingOfferView] = []
    ) {
        self.key = key
        self.config = config
        self.matchesRequest = matchesRequest
        self.recommended = recommended
        self.priceLow = priceLow
        self.priceHigh = priceHigh
        self.image = image
        self.offers = offers
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
