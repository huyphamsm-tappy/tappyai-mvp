import Foundation

/// The server's `[TAPPY_MEDIA]` block (CONSULT_V3 layouts, TAPPY_ANSWER_V4): news pictures or a
/// Wikipedia subject card. Swift port of web `src/lib/media/mediaHosts.ts` and Android
/// `MediaBlocks` — the allow-lists below must stay equal to them.
///
/// The block is persisted with the message, so it is treated like every other marker: the raw JSON
/// never shows, and nothing the block names is trusted. Every URL is re-checked HERE before it can
/// reach an image loader or a link, so a stored or forged block can never point the app at a host
/// outside the lists.
enum MediaBlock: Equatable, Sendable {
    /// One picture of a news layout: the article's own image, its own link, the outlet's name.
    struct NewsItem: Equatable, Sendable {
        let src: String
        let href: String
        let label: String
        let title: String
    }

    /// The subject card of a knowledge answer: a Wikipedia summary.
    struct Entity: Equatable, Sendable {
        let name: String
        let summary: String
        let image: String?
        let href: String
    }

    case news([NewsItem])
    /// One card, or 2–3 side by side for a comparison.
    case entities([Entity])
}

enum MediaBlocks {
    private static let maxURLLength = 1024
    private static let maxNewsItems = 6
    private static let maxEntities = 3

    /// News CDNs of the RSS feeds get_news reads, and Wikimedia's file hosts.
    private static let imageSuffixes = ["vnecdn.net", "tuoitre.vn", "tuoitre.com.vn", "dantri.com.vn", "dtrinews.vn"]
    private static let imageExactHosts = ["upload.wikimedia.org", "thumb.wikimedia.org"]
    /// Article pages of those outlets, and Wikipedia article pages.
    private static let pageSuffixes = ["vnexpress.net", "tuoitre.vn", "dantri.com.vn"]
    private static let pageExactHosts = ["vi.wikipedia.org", "en.wikipedia.org"]

    private static func hasSuffix(_ host: String, _ suffix: String) -> Bool {
        host == suffix || host.hasSuffix("." + suffix)
    }

    /// The host of a well-formed https URL without credentials, or nil. Never an IP literal or an internal name.
    private static func safeHTTPSHost(_ raw: String) -> String? {
        guard raw.count <= maxURLLength,
              let parts = URLComponents(string: raw),
              parts.scheme?.lowercased() == "https",
              parts.user == nil, parts.password == nil,
              let host = parts.host?.lowercased(), !host.isEmpty else { return nil }
        if host == "localhost" || host.hasSuffix(".localhost") || host.hasSuffix(".local") || host.hasSuffix(".internal") {
            return nil
        }
        if host.contains(":") || host.allSatisfy({ $0.isNumber || $0 == "." }) { return nil }
        return host
    }

    static func isAllowedImage(_ url: String?) -> Bool {
        guard let url, let host = safeHTTPSHost(url) else { return false }
        return imageExactHosts.contains(host) || imageSuffixes.contains { hasSuffix(host, $0) }
    }

    static func isAllowedPage(_ url: String?) -> Bool {
        guard let url, let host = safeHTTPSHost(url) else { return false }
        if pageExactHosts.contains(host) {
            // A Wikipedia link is an article page only.
            return url.range(of: #"^https://(vi|en)\.wikipedia\.org/wiki/[^?#\s]+$"#, options: .regularExpression) != nil
        }
        return pageSuffixes.contains { hasSuffix(host, $0) }
    }

    private static func clean(_ raw: Any?, _ max: Int) -> String {
        guard let s = raw as? String else { return "" }
        let spaced = String(s.unicodeScalars.map { $0.value < 0x20 ? " " : Character($0) })
        let collapsed = spaced.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return String(collapsed.prefix(max))
    }

    private static func entity(from raw: Any?) -> MediaBlock.Entity? {
        guard let o = raw as? [String: Any] else { return nil }
        let name = clean(o["name"], 80)
        let summary = clean(o["summary"], 700)
        guard !name.isEmpty, !summary.isEmpty, let href = o["href"] as? String, isAllowedPage(href) else { return nil }
        let image = (o["image"] as? String).flatMap { isAllowedImage($0) ? $0 : nil }
        return MediaBlock.Entity(name: name, summary: summary, image: image, href: href)
    }

    /// Re-validates one decoded block. Anything not allowed is dropped; nothing valid left → nil.
    static func sanitize(_ raw: Any) -> MediaBlock? {
        guard let r = raw as? [String: Any], (r["v"] as? Int) == 1 else { return nil }
        switch r["kind"] as? String {
        case "news":
            let items: [MediaBlock.NewsItem] = ((r["items"] as? [Any]) ?? []).compactMap { x in
                guard let o = x as? [String: Any],
                      let src = o["src"] as? String, isAllowedImage(src),
                      let href = o["href"] as? String, isAllowedPage(href) else { return nil }
                let label = clean(o["label"], 40)
                return MediaBlock.NewsItem(
                    src: src, href: href,
                    label: label.isEmpty ? (safeHTTPSHost(href) ?? "") : label,
                    title: clean(o["title"], 160)
                )
            }
            let kept = Array(items.prefix(maxNewsItems))
            return kept.isEmpty ? nil : MediaBlock.news(kept)
        case "entity":
            return entity(from: r["entity"]).map { MediaBlock.entities([$0]) }
        case "entities":
            var seen = Set<String>()
            let list = ((r["entities"] as? [Any]) ?? []).compactMap(entity(from:)).filter { seen.insert($0.href).inserted }
            let kept = Array(list.prefix(maxEntities))
            return kept.isEmpty ? nil : MediaBlock.entities(kept)
        default:
            return nil
        }
    }

    /// Removes every `[TAPPY_MEDIA]` block from `content` — complete, malformed, or still arriving — and
    /// returns the valid ones. Stripping never depends on whether the JSON parsed.
    static func parse(_ content: String) -> (text: String, blocks: [MediaBlock]) {
        guard content.range(of: "TAPPY_MEDIA]", options: .caseInsensitive) != nil,
              let closed = try? NSRegularExpression(pattern: #"\[TAPPY_MEDIA\]([\s\S]*?)\[/TAPPY_MEDIA\]"#, options: .caseInsensitive)
        else { return (content, []) }

        let ns = content as NSString
        var blocks: [MediaBlock] = []
        var text = ""
        var cursor = 0
        for m in closed.matches(in: content, range: NSRange(location: 0, length: ns.length)) {
            text += ns.substring(with: NSRange(location: cursor, length: m.range.location - cursor))
            cursor = m.range.location + m.range.length
            let body = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines)
            if let data = body.data(using: .utf8),
               let object = try? JSONSerialization.jsonObject(with: data),
               let block = sanitize(object) {
                blocks.append(block)
            }
        }
        text += ns.substring(from: cursor)

        // A block still arriving, or an orphan tag: removed to the end of the text.
        if let tail = try? NSRegularExpression(pattern: #"\[/?TAPPY_MEDIA\][\s\S]*$"#, options: .caseInsensitive) {
            text = tail.stringByReplacingMatches(in: text, range: NSRange(location: 0, length: (text as NSString).length), withTemplate: "")
        }
        return (text.trimmingCharacters(in: .whitespacesAndNewlines), blocks)
    }
}
