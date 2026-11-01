import Foundation

/// Owner 01/11 (iOS = the web): "nghiêm cấm không được sử dụng nguồn của bất cứ AI nào" — another AI product's answer or chat
/// page (AIHAY at ai-hay.vn and its app, ChatGPT, Perplexity, Gemini, Claude…) is never a source. The server already filters every
/// source (web `src/lib/security/aiSourcePolicy.ts`) and its link guard keeps only the links a tool returned; this is the same rule
/// on the phone as a second line, for a link that reached the client anyway (an old saved reply, a frame). A port of the web policy
/// and of Android `AiSourcePolicy.kt`: a host list (a domain and every subdomain), a few chat paths of general hosts, the app-store
/// pages that name the product, and the forms an address really arrives in (scheme-less, protocol-relative, wrapped by a
/// redirector, an archive or a page reader). A company's own site (its blog, its announcements) stays a source.
/// The lists are DATA and must stay equal to the web's: add a product by adding it there first.
enum AiSourcePolicy {
    private static let hosts: [String] = [
        "aihay.vn", "aihay.net", "aihay.com", "aihay.ai", "aihay.org", "aihay.app", "ai-hay.vn", "ai-hay.com", "ai-hay.net",
        "chatgpt.com", "chat.openai.com", "perplexity.ai",
        "gemini.google.com", "bard.google.com", "notebooklm.google.com", "aistudio.google.com",
        "claude.ai", "copilot.microsoft.com", "poe.com", "grok.com", "chat.deepseek.com", "you.com", "phind.com", "meta.ai", "character.ai",
        "chat.mistral.ai", "kimi.com", "kimi.ai", "chat.qwen.ai", "duck.ai",
    ]

    /// An AI product that lives on a PATH of a general host.
    private static let chatPaths: [(host: String, pattern: String)] = [
        ("bing.com", #"^/chat(?:/|$)"#),
        ("huggingface.co", #"^/chat(?:/|$)"#),
    ]

    private static let appStores: [String] = ["play.google.com", "apps.apple.com", "itunes.apple.com", "galaxy.store", "appgallery.huawei.com"]
    private static let brandPattern = #"ai[-_]?hay"#

    private struct Parsed {
        let host: String
        let path: String
        let query: String
    }

    // MARK: - Reading an address

    private static func groups(_ pattern: String, in s: String, caseInsensitive: Bool = false) -> [String]? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : []) else { return nil }
        let ns = s as NSString
        guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
        return (0..<m.numberOfRanges).map { i in
            let r = m.range(at: i)
            return r.location == NSNotFound ? "" : ns.substring(with: r)
        }
    }

    private static func matches(_ pattern: String, _ s: String, caseInsensitive: Bool = false) -> Bool {
        groups(pattern, in: s, caseInsensitive: caseInsensitive) != nil
    }

    /// Every match of `pattern` in `s` replaced by `transform(groups)`; a nil answer keeps the match as it was.
    private static func replacing(_ pattern: String, in s: String, _ transform: ([String]) -> String?) -> String {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return s }
        let ns = s as NSString
        var out = ""
        var cursor = 0
        for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
            out += ns.substring(with: NSRange(location: cursor, length: m.range.location - cursor))
            let g: [String] = (0..<m.numberOfRanges).map { i in
                let r = m.range(at: i)
                return r.location == NSNotFound ? "" : ns.substring(with: r)
            }
            out += transform(g) ?? g[0]
            cursor = m.range.location + m.range.length
        }
        out += ns.substring(from: cursor)
        return out
    }

    /// An address as host / path / query: scheme-less and protocol-relative forms get https, a displayed link ("host › path") is its
    /// first token. Nil when it is none (only http and https are addresses here).
    private static func parse(_ raw: String) -> Parsed? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.split(whereSeparator: { $0.isWhitespace }).first else { return nil }
        var s = String(first)
        if s.hasPrefix("//") {
            s = "https:" + s
        } else if !matches(#"^[a-z][a-z0-9+.-]*:"#, s, caseInsensitive: true),
                  matches(#"^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#]|$)"#, s, caseInsensitive: true) {
            s = "https://" + s
        }
        guard let g = groups(#"^(https?)://([^/?#]*)([^?#]*)(?:\?([^#]*))?"#, in: s, caseInsensitive: true) else { return nil }
        let authority = g[2].split(separator: "@", omittingEmptySubsequences: false).last.map(String.init) ?? ""
        var host = authority.hasPrefix("[") ? authority : (authority.split(separator: ":", omittingEmptySubsequences: false).first.map(String.init) ?? "")
        host = host.lowercased()
        while host.hasSuffix(".") { host.removeLast() }
        guard !host.isEmpty else { return nil }
        return Parsed(host: host, path: g[3], query: g[4])
    }

    private static func onHost(_ h: String, _ d: String) -> Bool {
        h == d || h.hasSuffix("." + d)
    }

    /// The decoded value of a query parameter ("+" is a space), or nil.
    private static func param(_ query: String, _ name: String) -> String? {
        for kv in query.split(separator: "&", omittingEmptySubsequences: true) {
            let parts = kv.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard let key = parts.first, String(key) == name else { continue }
            let value = parts.count > 1 ? String(parts[1]) : ""
            return value.replacingOccurrences(of: "+", with: " ").removingPercentEncoding
        }
        return nil
    }

    private static func pathAndQuery(_ u: Parsed) -> String {
        u.path + (u.query.isEmpty ? "" : "?" + u.query)
    }

    /// The address a redirector, an archive or a page reader wraps, or nil. Only these known wrappers: a URL inside a query of any
    /// other site means nothing.
    private static func innerOf(_ u: Parsed) -> String? {
        let h = u.host
        if matches(#"^(?:[a-z0-9-]+\.)*google\.[a-z.]+$"#, h), u.path == "/url" || u.path.hasPrefix("/goto") {
            guard let v = param(u.query, "q") ?? param(u.query, "url") else { return nil }
            return v.lowercased().hasPrefix("http") ? v : nil
        }
        if h == "webcache.googleusercontent.com" {
            return groups(#"cache:(?:[\w-]+:)?(https?://.+)$"#, in: param(u.query, "q") ?? "", caseInsensitive: true)?[1]
        }
        if h == "r.jina.ai" {
            let rest = String(u.path.dropFirst()) + (u.query.isEmpty ? "" : "?" + u.query)
            return rest.lowercased().hasPrefix("http") ? rest : nil
        }
        if h == "web.archive.org" || h == "archive.org" {
            return groups(#"/web/\d+[a-z_]*/(https?://.*)$"#, in: pathAndQuery(u), caseInsensitive: true)?[1]
        }
        return nil
    }

    // MARK: - The policy

    /// True when the address is a page of another AI product (its domain, a chat path of a general host, its app's store page, or any
    /// of those wrapped). Pure; text that is not an http(s) address is false.
    static func isAiProductSource(_ url: String, depth: Int = 0) -> Bool {
        guard let u = parse(url) else { return false }
        if hosts.contains(where: { onHost(u.host, $0) }) { return true }
        if chatPaths.contains(where: { onHost(u.host, $0.host) && matches($0.pattern, u.path, caseInsensitive: true) }) { return true }
        if appStores.contains(where: { onHost(u.host, $0) }) {
            let raw = pathAndQuery(u)
            let decoded = raw.removingPercentEncoding ?? raw
            if matches(brandPattern, raw, caseInsensitive: true) || matches(brandPattern, decoded, caseInsensitive: true) { return true }
        }
        if depth < 2, let inner = innerOf(u) { return isAiProductSource(inner, depth: depth + 1) }
        return false
    }

    /// `[label](address)`, with one level of brackets allowed inside the address ("…/Foo_(bar)"); a leading "!" makes it an image.
    private static let markdownLink = #"(!?)\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)"#
    private static let bareAddress = #"https?://[^\s)\]]+"#

    /// The text with a link to an AI product's page reduced to its label (an image of one removed altogether) and a bare address of
    /// one removed; every other link is untouched.
    static func stripAiLinks(_ text: String) -> String {
        guard text.range(of: "http", options: .caseInsensitive) != nil || text.contains("](") else { return text }
        let withoutMarkdown = replacing(markdownLink, in: text) { g in
            guard isAiProductSource(g[3]) else { return nil }
            return g[1].isEmpty ? g[2] : ""
        }
        return replacing(bareAddress, in: withoutMarkdown) { g in
            isAiProductSource(g[0]) ? "" : nil
        }
    }
}
