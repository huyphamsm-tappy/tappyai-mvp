import Foundation

/// Which links of an answer open the quick-read sheet instead of leaving the app (web `src/lib/chat/readerLinks.ts`, owner 15/11/2026: "bấm vào
/// link thì hiện khung để đọc tin luôn"). ONE rule for every answer: an ordinary `https` link to another site. What keeps its usual behaviour: a
/// page that is not an article (a map, a video, a social network, a messenger), a booking or shopping site (a page to ACT on: the partners Agoda,
/// Vexere and Lazada and the other travel and shopping platforms always open where they belong), a tracked partner link, and a link with credentials.
/// Pure.
enum ReaderLinks {
    /// Pages that are not articles to read here.
    private static let notReadable = try? NSRegularExpression(
        pattern: #"(^|\.)(maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|youtube\.com|youtu\.be|tiktok\.com|facebook\.com|fb\.com|fb\.watch|instagram\.com|x\.com|twitter\.com|threads\.net|zalo\.me|t\.me|wa\.me|messenger\.com)$"#,
        options: .caseInsensitive)

    /// Booking and shopping platforms: a page to act on, and drawn by script, so a reader would show a placeholder.
    private static let actionSites = try? NSRegularExpression(
        pattern: #"(^|\.)(agoda\.[a-z.]+|vexere\.com|lazada\.[a-z.]+|shopee\.[a-z.]+|tiki\.vn|booking\.com|traveloka\.com|trip\.com|klook\.com|food\.grab\.com|grab\.com|shopeefood\.vn|befood\.vn|baemin\.vn|cellphones\.com\.vn|dienmayxanh\.com|thegioididong\.com|dienmaycholon\.vn)$"#,
        options: .caseInsensitive)

    /// Affiliate-network wrapper hosts (web `ACCESSTRADE_WRAPPER_HOSTS`) and Tappy's own click path: a handoff that must land on the partner.
    private static let wrapperHosts: Set<String> = ["go.isclix.com"]

    /// The page a tap on `url` should open in the reader, or nil when the link keeps its usual behaviour. `ownHost` is this app's own site.
    static func target(for url: URL, ownHost: String? = nil) -> URL? {
        guard url.scheme?.lowercased() == "https", url.user == nil, url.password == nil, let rawHost = url.host?.lowercased(),
              let safe = safeWebURL(url.absoluteString), safe.scheme?.lowercased() == "https" else { return nil }
        let host = rawHost.hasPrefix("www.") ? String(rawHost.dropFirst(4)) : rawHost
        if let ownHost, host == ownHost.lowercased().replacingOccurrences(of: "www.", with: "") { return nil }
        if matches(notReadable, host) || matches(actionSites, host) { return nil }
        if rawHost.contains("google."), url.path.hasPrefix("/maps") { return nil }
        if wrapperHosts.contains(rawHost) || url.path == "/go/at" { return nil }
        return safe
    }

    private static func matches(_ regex: NSRegularExpression?, _ host: String) -> Bool {
        guard let regex else { return false }
        return regex.firstMatch(in: host, range: NSRange(host.startIndex..., in: host)) != nil
    }
}

/// What `GET /api/link-preview?u=` returned for a page: the page's own title, site, date, description and first passages. `ok == false` is a page
/// that cannot be read automatically (many news sites block it): the reader then shows the address and the button to the original page, so a tap
/// never leads nowhere.
struct LinkPreview: Equatable, Sendable {
    var ok = false
    var title: String?
    var siteName: String?
    var description: String?
    var publishedAt: Date?
    var passages: [String] = []

    /// A response is data: every text is bounded and made one line, a missing or wrong field is simply absent.
    static func read(_ data: Data) -> LinkPreview {
        guard let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], (o["ok"] as? Bool) == true else { return LinkPreview() }
        func text(_ any: Any?, _ max: Int) -> String? {
            guard let s = any as? String else { return nil }
            let t = s.unicodeScalars.map { $0.value < 0x20 || $0.value == 0x7f ? " " : String($0) }.joined()
                .split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
            return t.isEmpty ? nil : String(t.prefix(max))
        }
        var date: Date?
        if let iso = o["publishedAt"] as? String { date = StayOfferLine.parse(iso) ?? ISO8601DateFormatter().date(from: iso) }
        return LinkPreview(ok: true, title: text(o["title"], 200), siteName: text(o["siteName"], 80), description: text(o["description"], 600),
                           publishedAt: date, passages: (o["passages"] as? [Any] ?? []).prefix(8).compactMap { text($0, 800) })
    }
}

struct LinkPreviewService: Sendable {
    let api: APIClient

    /// The preview of `url`, or an unreadable one on any failure (never throws): the sheet shows the address and the original page's button.
    func preview(of url: URL) async -> LinkPreview {
        let endpoint = Endpoint(path: "/api/link-preview", method: .get, query: [URLQueryItem(name: "u", value: url.absoluteString)], requiresAuth: false)
        guard let data = try? await api.send(endpoint) else { return LinkPreview() }
        return LinkPreview.read(data)
    }
}
