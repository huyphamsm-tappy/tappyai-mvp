import Foundation

/// The Deals page of the web shows only the deals of four partners (owner, 20/11/2026): Accesstrade, Lazada, Agoda and Vexere
/// (`src/lib/deals/partnerAllowlist.ts`). The feed itself (`GET /api/deals`) is shared with the apps and is not changed: the page filters what it
/// draws. A partner name matches when it BEGINS with one of the four once everything but letters and digits is dropped ("Lazada", "lazada.vn" and
/// "Accesstrade VN" match; "notagoda" does not).
enum DealPartnerAllowlist {
    static let allowed: [String] = ["accesstrade", "lazada", "agoda", "vexere"]

    static func isAllowed(_ name: String?) -> Bool {
        guard let name else { return false }
        let n = String(name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().unicodeScalars.filter {
            ($0.value >= 0x61 && $0.value <= 0x7a) || ($0.value >= 0x30 && $0.value <= 0x39)
        })
        return !n.isEmpty && allowed.contains { n == $0 || n.hasPrefix($0) }
    }
}

/// A booking partner the server really has a tracked affiliate link for (`GET /api/deals/partners`). The web shows these cards only when the
/// managed feed has no deal, so the page is never an empty shell. No price, discount or availability is claimed: they are front doors.
struct DealPartnerCard: Decodable, Equatable, Identifiable, Sendable {
    let providerId: String
    let partnerName: String
    /// The key of the one-line description (`deals.partner.<provider>`), resolved from the app's own string catalogue.
    let descriptionKey: String
    /// Already the tracked link: absolute `https`, or a path on the server's own origin (`/go/at?...`).
    let url: String

    var id: String { providerId }
}

struct DealPartnerCardsResponse: Decodable, Sendable {
    let partners: [DealPartnerCard]

    enum CodingKeys: String, CodingKey { case partners }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        partners = c.lossyArray(DealPartnerCard.self, forKey: .partners)
    }
}

enum DealPartnerCardLink {
    /// The address a card opens: an absolute `https` link, or a path (`/go/at...`) resolved on the server's own origin. Anything else opens nothing.
    static func url(for card: DealPartnerCard, base: URL) -> URL? {
        let raw = card.url.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasPrefix("/"), !raw.hasPrefix("//") {
            guard !raw.unicodeScalars.contains(where: { $0.value < 0x21 || $0.value == 0x7f }),
                  let origin = DealLink.url(from: base.absoluteString),
                  var parts = URLComponents(url: origin, resolvingAgainstBaseURL: false) else { return nil }
            parts.percentEncodedPath = ""
            guard let root = parts.url else { return nil }
            return URL(string: raw, relativeTo: root)?.absoluteURL
        }
        return DealLink.url(from: raw)
    }
}
