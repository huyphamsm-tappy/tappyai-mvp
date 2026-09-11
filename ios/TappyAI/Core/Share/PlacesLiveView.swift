import Foundation

/// The structured recommendation of one chat turn — the `tappy.places.v1` annotation the
/// web emits as an `8:` data-stream frame (`src/lib/recommendation/liveView.ts`).
///
/// 🚨 IN MEMORY ONLY. Places data is live-only by policy: this is never written to the
/// conversation store. It exists so the share artifact can carry phone / hours / Maps
/// links that the prose (`0:` frames) does not contain — mobile parity with the web share.
///
/// Decoded by field name with unknown keys ignored, so the wire can grow without breaking
/// this client. Only the fields the share whitelist needs are modelled — there is no slot
/// for `distanceKm`, `rank`, `id`, `matchVerdict` or `priceSignal`, by design.
struct PlacesLiveView: Equatable, Sendable {
    let domain: String
    let items: [LivePlace]
}

struct LivePlace: Equatable, Sendable {
    let name: String
    var image: String? = nil
    var address: String? = nil
    var rating: Double? = nil
    var ratingCount: Int? = nil
    var openingHours: String? = nil
    var openNow: Bool? = nil
    var phone: String? = nil
    var priceRangeText: String? = nil
    var categories: [String] = []
    var reasons: [String] = []
    var actions: [LiveAction] = []
}

struct LiveAction: Equatable, Sendable {
    let kind: String
    let urlKind: String
    let url: String
    var platform: String? = nil
    var attributed: Bool? = nil
}

enum PlacesLiveViewParser {
    static let annotationKind = "tappy.places.v1"

    /// One `8:` payload → the view, or nil when it is not the places annotation.
    ///
    /// The AI SDK writes annotations as `8:[{…},{…}]`; the places view is the element
    /// whose `kind` is `annotationKind`. Anything malformed is nil, never a throw — a bad
    /// frame must cost the share card, not the reply.
    static func parse(annotationPayload data: Data) -> PlacesLiveView? {
        guard let root = try? JSONSerialization.jsonObject(with: data) else { return nil }
        let candidates: [[String: Any]]
        if let arr = root as? [[String: Any]] { candidates = arr }
        else if let obj = root as? [String: Any] { candidates = [obj] }
        else { return nil }
        guard let view = candidates.first(where: { ($0["kind"] as? String) == annotationKind }) else { return nil }
        return parseView(view)
    }

    private static func parseView(_ o: [String: Any]) -> PlacesLiveView? {
        let items = ((o["items"] as? [[String: Any]]) ?? []).compactMap(parsePlace)
        guard !items.isEmpty else { return nil }
        return PlacesLiveView(domain: (o["domain"] as? String) ?? "food", items: items)
    }

    private static func parsePlace(_ o: [String: Any]) -> LivePlace? {
        let name = ((o["name"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }
        let reasons = ((o["reasons"] as? [[String: Any]]) ?? []).compactMap { $0["evidence"] as? String }
        let actions = ((o["actions"] as? [[String: Any]]) ?? []).compactMap { a -> LiveAction? in
            guard let kind = a["kind"] as? String, let url = a["url"] as? String else { return nil }
            return LiveAction(
                kind: kind,
                urlKind: (a["urlKind"] as? String) ?? "direct",
                url: url,
                platform: a["platform"] as? String,
                attributed: a["attributed"] as? Bool
            )
        }
        return LivePlace(
            name: name,
            image: o["image"] as? String,
            address: o["address"] as? String,
            rating: (o["rating"] as? NSNumber)?.doubleValue,
            ratingCount: (o["ratingCount"] as? NSNumber)?.intValue,
            openingHours: o["openingHours"] as? String,
            openNow: o["openNow"] as? Bool,
            phone: o["phone"] as? String,
            priceRangeText: o["priceRangeText"] as? String,
            categories: (o["categories"] as? [String]) ?? [],
            reasons: reasons,
            actions: actions
        )
    }
}
