import Foundation

/// The pages an answer links to, for the "Nguồn · N" chip under it (web `answerSources` in `ArticleAnswer.tsx`, owner 28/10, final UAT 19/11).
///
/// One entry per PAGE: markdown links with a safe `https` address, the same page twice counted once. (The web once counted one per site: three
/// articles of one newspaper read "Sources · 1" under an answer that cites three.) A page of another AI product is never a source here
/// (`safeWebURL`, owner 01/11). Pure: no network, nothing is added that the answer did not already link to.
struct AnswerSource: Equatable, Sendable, Identifiable {
    let label: String
    let url: URL
    /// The page's site without a leading `www.`.
    let host: String

    var id: String { url.absoluteString }
}

enum AnswerSources {
    /// The web's limit of listed sources.
    static let maxSources = 12

    private static let link = try? NSRegularExpression(pattern: #"\[([^\]\n]{1,80})\]\((https://[^)\s]{1,500})\)"#)

    static func of(_ text: String, max: Int = maxSources) -> [AnswerSource] {
        guard let link, !text.isEmpty else { return [] }
        var out: [AnswerSource] = []
        var seen = Set<String>()
        let whole = NSRange(text.startIndex..., in: text)
        for m in link.matches(in: text, range: whole) {
            guard let labelRange = Range(m.range(at: 1), in: text), let hrefRange = Range(m.range(at: 2), in: text) else { continue }
            let href = String(text[hrefRange])
            guard let url = safeWebURL(href), url.scheme?.lowercased() == "https", let rawHost = url.host?.lowercased() else { continue }
            let host = rawHost.hasPrefix("www.") ? String(rawHost.dropFirst(4)) : rawHost
            guard !host.isEmpty else { continue }
            var path = url.path
            while path.hasSuffix("/") { path.removeLast() }
            let page = host + path + (url.query.map { "?" + $0 } ?? "")
            guard seen.insert(page).inserted else { continue }
            let label = String(text[labelRange]).filter { $0 != "*" && $0 != "_" && $0 != "`" }
                .trimmingCharacters(in: .whitespacesAndNewlines)
            out.append(AnswerSource(label: label.isEmpty ? host : label, url: url, host: host))
            if out.count >= max { break }
        }
        return out
    }

    /// The first letters of up to three different sites, for the chip's badges (no favicon service: it would tell that service which sources the
    /// person reads).
    static func badgeLetters(_ sources: [AnswerSource]) -> [String] {
        var seen = Set<String>()
        var letters: [String] = []
        for s in sources where seen.insert(s.host).inserted {
            letters.append(String(s.host.prefix(1)).uppercased())
            if letters.count == 3 { break }
        }
        return letters
    }
}
