import Foundation

/// The structured recommendation of one chat turn, projected for the SHARE artifact — the
/// `tappy.places.v1` annotation the web emits as an `8:` data-stream frame
/// (`src/lib/recommendation/liveView.ts`).
///
/// Two consumers, one frame: the chat's decision card reads the full `PlacesLiveView`
/// (`Features/Chat/Model/PlacesModels.swift`, decoded once by `StreamingClient`); the share
/// sheet reads THIS thinner shape, built from that decode (`init(from:)`). The share whitelist
/// is the point of the separation — there is no slot here for `distanceKm`, `rank`, `id`,
/// `matchVerdict`, `priceSignal` or commerce facts, by design.
///
/// 🚨 IN MEMORY ONLY. Places data is live-only by policy: this is never written to the
/// conversation store.
struct SharePlacesView: Equatable, Sendable {
    let domain: String
    let items: [SharePlace]
}

struct SharePlace: Equatable, Sendable {
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
    var actions: [ShareAction] = []
}

struct ShareAction: Equatable, Sendable {
    let kind: String
    let urlKind: String
    let url: String
    var platform: String? = nil
    var attributed: Bool? = nil
}

extension SharePlacesView {
    /// The share projection of the decoded live frame. Nil when there is nothing to share.
    init?(from live: PlacesLiveView) {
        let items = live.items.compactMap { p -> SharePlace? in
            let name = p.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { return nil }
            return SharePlace(
                name: name,
                image: p.image,
                address: p.address,
                rating: p.rating,
                ratingCount: p.ratingCount,
                openingHours: p.openingHours,
                openNow: p.openNow,
                phone: p.phone,
                priceRangeText: p.priceRangeText,
                categories: p.categories,
                reasons: p.reasons.map(\.evidence).filter { !$0.isEmpty },
                actions: p.actions.compactMap { a in
                    guard !a.url.isEmpty else { return nil }
                    return ShareAction(kind: a.kind, urlKind: a.urlKind.isEmpty ? "direct" : a.urlKind, url: a.url, platform: a.platform, attributed: a.attributed)
                }
            )
        }
        guard !items.isEmpty else { return nil }
        self.init(domain: live.domain.isEmpty ? "food" : live.domain, items: items)
    }
}

enum SharePlacesViewParser {
    static let annotationKind = "tappy.places.v1"

    /// One `8:` payload → the share view, or nil when it is not the places annotation.
    /// Kept for the share tests and any caller holding a raw payload; the chat path decodes
    /// the frame once (`StreamingClient`) and converts with `SharePlacesView(from:)`.
    static func parse(annotationPayload data: Data) -> SharePlacesView? {
        guard let root = try? JSONSerialization.jsonObject(with: data) else { return nil }
        let candidates: [[String: Any]]
        if let arr = root as? [[String: Any]] { candidates = arr }
        else if let obj = root as? [String: Any] { candidates = [obj] }
        else { return nil }
        guard let view = candidates.first(where: { ($0["kind"] as? String) == annotationKind }) else { return nil }
        return parseView(view)
    }

    private static func parseView(_ o: [String: Any]) -> SharePlacesView? {
        let items = ((o["items"] as? [[String: Any]]) ?? []).compactMap(parsePlace)
        guard !items.isEmpty else { return nil }
        return SharePlacesView(domain: (o["domain"] as? String) ?? "food", items: items)
    }

    private static func parsePlace(_ o: [String: Any]) -> SharePlace? {
        let name = ((o["name"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }
        let reasons = ((o["reasons"] as? [[String: Any]]) ?? []).compactMap { $0["evidence"] as? String }
        let actions = ((o["actions"] as? [[String: Any]]) ?? []).compactMap { a -> ShareAction? in
            guard let kind = a["kind"] as? String, let url = a["url"] as? String else { return nil }
            return ShareAction(
                kind: kind,
                urlKind: (a["urlKind"] as? String) ?? "direct",
                url: url,
                platform: a["platform"] as? String,
                attributed: a["attributed"] as? Bool
            )
        }
        return SharePlace(
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
