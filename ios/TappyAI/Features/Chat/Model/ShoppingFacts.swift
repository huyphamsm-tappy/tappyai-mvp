import Foundation

// Owner 01/11 (iOS = the web): the facts a shopping row carries that the web shows (components/chat/ShoppingDecision.tsx) and iOS did not read —
// the rating of the offer the row features, the stated specs and the seller's condition. The server writes them into the marker (SynthesisView);
// this derives nothing: a field the server did not send shows nothing. A port of Android `ShoppingFacts.kt`.

/// One stated specification: the key the server gave ("chip", "ram", "storage", "size") and the listing's own figure as text (a bare number
/// the server wrote is kept as text). A spec without a key or with a value that is not a scalar is not a spec.
struct ShoppingSpecView: Codable, Equatable, Sendable {
    let key: String
    let value: String

    private enum CodingKeys: String, CodingKey { case key, value }

    init(key: String, value: String) {
        self.key = key
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        if let s = try? c.decode(String.self, forKey: .value) { value = s }
        else if let n = try? c.decode(Int64.self, forKey: .value) { value = String(n) }
        else if let d = try? c.decode(Double.self, forKey: .value) { value = String(d) }
        else { throw DecodingError.dataCorruptedError(forKey: .value, in: c, debugDescription: "a spec value is text or a number") }
    }
}

/// The seller's own condition wording, plus a key a dictionary can translate (nil = no entry: the wording stands).
struct ShoppingConditionView: Codable, Equatable, Sendable {
    let key: String?
    let label: String

    private enum CodingKeys: String, CodingKey { case key, label }

    init(key: String?, label: String) {
        self.key = key
        self.label = label
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = (try? c.decodeIfPresent(String.self, forKey: .key)) ?? nil
        label = ((try? c.decodeIfPresent(String.self, forKey: .label)) ?? nil) ?? ""
    }
}

/// The offer a row features: the recommended seller's own when it has one, else the first (web `featuredOffer`).
func featuredOffer(_ e: ShoppingEntityView, seller: String? = nil) -> ShoppingOfferView? {
    if let seller, let own = e.offers.first(where: { $0.seller != nil && $0.seller == seller }) { return own }
    return e.offers.first
}

/// A rating as the reader's language writes it: `value` ("4.5") and, when the listing carries a review count, `count` ("1.234" / "1,234").
struct RatingFacts: Equatable {
    let value: String
    let count: String?
}

/// The featured listing's own rating; nothing when it has none (the entity has no rating of its own).
func ratingFacts(rating: Double?, count: Int?, lang: String) -> RatingFacts? {
    guard let rating, rating.isFinite else { return nil }
    let value = rating.truncatingRemainder(dividingBy: 1) == 0 && abs(rating) < 1e9 ? String(Int(rating)) : String(rating)
    var grouped: String?
    if let count, count > 0 {
        let f = NumberFormatter()
        f.locale = Locale(identifier: lang == "vi" ? "vi_VN" : "en_US")
        f.numberStyle = .decimal
        f.usesGroupingSeparator = true
        grouped = f.string(from: NSNumber(value: count))
    }
    return RatingFacts(value: value, count: grouped)
}

/// The chips under a row: each stated spec labelled by `spec`, then the seller's condition (`condition` for a key it knows, else the seller's own
/// wording). Blank ones are left out.
func specChips(_ e: ShoppingEntityView, spec: (String, String) -> String, condition: (String) -> String?) -> [String] {
    let specs = e.specs.map { spec($0.key, $0.value) }
    let cond: String? = e.condition.map { c in c.key.flatMap(condition) ?? c.label }
    return (specs + (cond.map { [$0] } ?? [])).filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

/// The words the card puts on a spec and on a condition key: the catalog's, so each language reads its own.
enum ShoppingFactsLabels {
    /// The condition keys the server writes and the catalog translates (`shoppingDecision.condition.<key>`).
    static let conditionKeys = ["dealerOfficial", "warrantyOfficial", "genuine", "official", "likeNew", "refurbished", "sealed", "gradeHigh", "used"]

    static func condition(key: String) -> String? {
        guard conditionKeys.contains(key) else { return nil }
        return NSLocalizedString("shoppingDecision.condition." + key, comment: "")
    }

    static func spec(key: String, value: String) -> String {
        switch key {
        case "ram": return String(format: NSLocalizedString("shoppingDecision.specRam", comment: ""), value)
        case "storage": return String(format: NSLocalizedString("shoppingDecision.specStorage", comment: ""), value)
        default: return value
        }
    }

    /// "★ 4.5 · 1.234 đánh giá", or "★ 4.5" when the listing has no review count.
    static func ratingLine(_ r: RatingFacts) -> String {
        if let count = r.count {
            return String(format: NSLocalizedString("shoppingDecision.ratingLine", comment: ""), r.value, count)
        }
        return String(format: NSLocalizedString("shoppingDecision.ratingOnly", comment: ""), r.value)
    }
}
