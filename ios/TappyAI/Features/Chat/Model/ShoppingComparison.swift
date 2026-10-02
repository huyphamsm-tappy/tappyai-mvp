import Foundation

/// P4-07 — the comparison iOS renders, derived from the decision the reply already carried.
///
/// Swift twin of web's `comparisonFromSynthesis.ts` and Android's `ShoppingComparison.kt`. Impact
/// class A: the shopping marker already delivers every entity, its price range, its verdict and the
/// server's recommendation, so a comparison is a different PRESENTATION of the same payload and
/// asks the backend for nothing new.
///
/// 🚨 IT DERIVES, IT DOES NOT INFER. Each attribute restates a field the server supplied and is
/// already shown by the decision card: the price range, the match verdict, the seller count.
/// Nothing is ranked, scored or averaged, and there is deliberately no "cheapest" attribute —
/// that would be the client forming an opinion the server did not state.

struct ComparisonEntity: Equatable, Identifiable {
    let key: String
    let label: String
    /// Attribute key → value. `nil` means genuinely unknown, never "none" and never zero.
    let values: [String: String?]
    var id: String { key }
}

struct ComparisonAttribute: Equatable, Identifiable {
    let key: String
    let label: String
    var id: String { key }
}

struct ShoppingComparison: Equatable {
    let entities: [ComparisonEntity]
    let attributes: [ComparisonAttribute]
    /// Nil unless the server both recommended something AND said why (DD-005).
    let recommendedKey: String?
    let reason: String?
}

/// DD-005 caps. Beyond these, comparison stops helping.
let comparisonMaxEntities = 4
let comparisonMaxAttributes = 6

/// Labels the caller resolves from the String Catalog, so the derivation stays free of SwiftUI.
struct ComparisonLabels {
    let price: String
    let match: String
    let sellers: String
    let unknown: String
    let matchExact: String
    let matchDifferent: String
    let matchUnknown: String
    let sellerCount: (Int) -> String
    let priceRange: (Double?, Double?) -> String
}

extension ComparisonLabels {
    /// The labels resolved from the String Catalog.
    ///
    /// Kept out of the derivation itself so `shoppingComparison(from:labels:)` stays pure and can
    /// be tested without a bundle — the same split Android uses for the same reason.
    ///
    /// `priceRange` delegates to `shoppingPriceRangeText`, the function the decision card already
    /// uses, so a range in the comparison can never disagree with the range shown above it.
    static var localized: ComparisonLabels {
        let unknown = String(localized: "shoppingDecision.noPrice")
        return ComparisonLabels(
            price: String(localized: "comparison.attrPrice"),
            match: String(localized: "comparison.attrMatch"),
            sellers: String(localized: "comparison.attrSellers"),
            unknown: String(localized: "comparison.unknown"),
            matchExact: String(localized: "shoppingDecision.matchExact"),
            matchDifferent: String(localized: "shoppingDecision.matchDifferent"),
            matchUnknown: String(localized: "shoppingDecision.matchUnknown"),
            sellerCount: { n in "\(n) " + String(localized: "comparison.attrSellers").lowercased() },
            priceRange: { low, high in shoppingPriceRangeText(low: low, high: high, unknown: unknown) }
        )
    }
}

/// Projects a decision into a comparison, or nil when there is nothing to compare.
///
/// Returns nil below two entities: one option is not a comparison, and offering the control would
/// promise a decision aid that cannot exist.
func shoppingComparison(from view: ShoppingDecisionView?, labels: ComparisonLabels) -> ShoppingComparison? {
    let source = Array((view?.entities ?? []).prefix(comparisonMaxEntities))
    guard source.count >= 2 else { return nil }

    func matchLabel(_ m: String) -> String {
        switch m {
        case ShoppingMatch.exact: return labels.matchExact
        case ShoppingMatch.different: return labels.matchDifferent
        default: return labels.matchUnknown
        }
    }

    let entities = source.map { e in
        ComparisonEntity(
            key: e.key,
            label: e.config,
            values: [
                "price": labels.priceRange(e.priceLow, e.priceHigh),
                "match": matchLabel(e.matchesRequest),
                // No offers is unknown territory, not "0 sellers".
                "sellers": e.offers.isEmpty ? nil : labels.sellerCount(e.offers.count),
            ]
        )
    }

    let attributes = Array([
        ComparisonAttribute(key: "price", label: labels.price),
        ComparisonAttribute(key: "match", label: labels.match),
        ComparisonAttribute(key: "sellers", label: labels.sellers),
    ].prefix(comparisonMaxAttributes))

    // DD-005 enforced here, not in the UI: a marked winner with nothing to justify it is
    // unreachable by construction.
    let recommended = source.first(where: { $0.recommended })
    let rec = view?.recommendation
    let reasons: [ShoppingReason] = {
        guard let rec, let recommended, rec.entityKey == recommended.key else { return [] }
        return rec.reasons
    }()
    let joined = reasons.map(\.evidence).filter { !$0.isEmpty }.joined(separator: " · ")
    let reason = joined.isEmpty ? nil : joined

    return ShoppingComparison(
        entities: entities,
        attributes: attributes,
        recommendedKey: reason != nil ? recommended?.key : nil,
        reason: reason
    )
}

/// Splits attributes into the ones that differ and the ones identical for every entity.
///
/// Same three rules as web and Android: an attribute nobody has a value for is dropped entirely;
/// an attribute every entity shares is folded away so the differences are what the eye lands on;
/// a partially unknown attribute counts as DIFFERING, because calling it "the same for all" would
/// be a claim the data does not support.
func partitionComparisonAttributes(
    entities: [ComparisonEntity],
    attributes: [ComparisonAttribute]
) -> (differing: [ComparisonAttribute], identical: [ComparisonAttribute]) {
    var differing: [ComparisonAttribute] = []
    var identical: [ComparisonAttribute] = []

    for attr in attributes {
        let known = entities.compactMap { $0.values[attr.key] ?? nil }.filter { !$0.isEmpty }
        if known.isEmpty { continue }
        if known.count == entities.count, known.allSatisfy({ $0 == known[0] }) {
            identical.append(attr)
        } else {
            differing.append(attr)
        }
    }

    return (Array(differing.prefix(comparisonMaxAttributes)), identical)
}
