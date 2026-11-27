import Foundation

/// «Thông tin nhanh» of a subject card (layout step 3, item 6; web `lib/chat/entityFacts.ts`): a few structured facts from Wikidata through
/// `GET /api/entity-facts?t=&w=&ui=`. Real data with a real source, never written by a model: a fact is shown only when the server returned it,
/// and a subject with none shows no facts row. The response is data, so it is re-checked here (bounded plain text, at most 8 pairs).
struct EntityFact: Equatable, Sendable {
    let label: String
    let value: String
}

enum EntityFacts {
    static let maxFacts = 8
    static let maxLabel = 40
    static let maxValue = 160

    /// The server's answer, re-checked. Empty when it is not usable.
    static func parse(_ data: Data) -> [EntityFact] {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = object["facts"] as? [Any] else { return [] }
        var out: [EntityFact] = []
        for item in list.prefix(maxFacts) {
            guard let o = item as? [String: Any] else { continue }
            let label = clean(o["label"], maxLabel)
            let value = clean(o["value"], maxValue)
            if !label.isEmpty, !value.isEmpty { out.append(EntityFact(label: label, value: value)) }
        }
        return out
    }

    /// The Wikipedia title and language of an article link (`https://vi.wikipedia.org/wiki/Elon_Musk` → «Elon Musk», vi); nil for any other link.
    static func wikiTitle(fromHref href: String) -> (title: String, wiki: String)? {
        guard let parts = URLComponents(string: href), let host = parts.host?.lowercased(),
              host == "vi.wikipedia.org" || host == "en.wikipedia.org",
              parts.path.hasPrefix("/wiki/") else { return nil }
        let raw = String(parts.path.dropFirst("/wiki/".count))
        guard let decoded = raw.removingPercentEncoding?.replacingOccurrences(of: "_", with: " "),
              !decoded.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return (decoded, host.hasPrefix("vi") ? "vi" : "en")
    }

    /// The pictures of a batch answer of `GET /api/entity-profile?t=&t=` (web `lib/chat/entityProfiles.ts`): name the answer used → a Wikimedia picture.
    /// A profile without a picture, or whose picture is not on a Wikimedia host, is left out.
    static func profileImages(_ data: Data) -> [String: URL] {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = object["profiles"] as? [Any] else { return [:] }
        var out: [String: URL] = [:]
        for item in list.prefix(6) {
            guard let o = item as? [String: Any], let name = o["name"] as? String,
                  let image = o["image"] as? String, MediaBlocks.isAllowedImage(image),
                  let url = safeWebURL(image) else { continue }
            out[SubjectImages.key(name)] = url
        }
        return out
    }

    private static func clean(_ raw: Any?, _ max: Int) -> String {
        guard let s = raw as? String else { return "" }
        let spaced = String(s.unicodeScalars.map { $0.value < 0x20 || $0.value == 0x7f ? " " : Character($0) })
        return String(spaced.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").prefix(max))
    }
}
