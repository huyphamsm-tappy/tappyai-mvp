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
        // A page's <style>/<script> text sometimes reaches the passages (owner UAT: the reader showed «@charset "UTF-8";.Modal-modalBackground{…»):
        // anything that looks like CSS or script is dropped, whatever the server sent.
        let description = text(o["description"], 600).flatMap { looksLikeCode($0) ? nil : $0 }
        let passages = (o["passages"] as? [Any] ?? []).prefix(8).compactMap { text($0, 800) }.filter { !looksLikeCode($0) }
        return LinkPreview(ok: true, title: text(o["title"], 200), siteName: text(o["siteName"], 80), description: description,
                           publishedAt: date, passages: passages)
    }

    /// True for a text that is CSS, JavaScript or JSON-ish markup rather than something a person wrote: an at-rule start, braces with
    /// declarations, script keywords, or a dense run of code punctuation with hardly any spaces. Ordinary prose, quotes and the odd
    /// bracket pass.
    static func looksLikeCode(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return false }
        let lower = t.lowercased()
        for start in ["@charset", "@import", "@font-face", "@keyframes", "@media", "@supports", "<style", "<script", "!function", "(function", "window.", "document."] where lower.hasPrefix(start) { return true }
        for marker in ["function(", "function (", "=>{", "var ", "const ", "{background:", "{display:", "{position:", "{margin:", "{padding:", "px;", "px}", "}.", "};"] where lower.contains(marker) { return true }
        let braces = t.filter { $0 == "{" || $0 == "}" }.count
        let semicolons = t.filter { $0 == ";" }.count
        if braces >= 2 && semicolons >= 2 { return true }
        let codePunct = t.filter { "{}();=<>[]".contains($0) }.count
        let spaces = t.filter { $0 == " " }.count
        return t.count >= 40 && Double(codePunct) / Double(t.count) > 0.08 && Double(spaces) / Double(t.count) < 0.08
    }
}

/// What asking for a preview came to.
enum LinkPreviewResult: Equatable, Sendable {
    /// The server answered (a readable page, or one it cannot read: both are an answer).
    case page(LinkPreview)
    /// The server has no such route (404: an older server). The link then opens where it always did, without a sheet in between.
    case unavailable
}

struct LinkPreviewService: Sendable {
    let api: APIClient

    /// The preview of `url`. Any failure other than a missing route is an unreadable page (never throws): the sheet shows the address and the
    /// original page's button, as the web does. A missing route (404) is `unavailable`, so a server without the reader never puts a sheet that can
    /// only say "cannot read" between the person and the page.
    func preview(of url: URL) async -> LinkPreviewResult {
        let endpoint = Endpoint(path: "/api/link-preview", method: .get, query: [URLQueryItem(name: "u", value: url.absoluteString)], requiresAuth: false)
        do {
            return .page(LinkPreview.read(try await api.send(endpoint)))
        } catch let error as AppError {
            if case .network(status: 404, _) = error { return .unavailable }
            return .page(LinkPreview())
        } catch {
            return .page(LinkPreview())
        }
    }
}
