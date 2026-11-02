import Foundation

/// No literal «**» in any answer — a line-for-line port of web `src/lib/chat/markdownNormalize.ts` (Android `MarkdownNormalize` /
/// `CardMarkdown`), so the three clients print the same text from the same reply.
///
/// The model writes an unpaired `**` on its own («**4.7⭐»), guards that cut a sentence leave half a pair behind, and the model
/// also writes markdown INSIDE the JSON strings of `[TAPPY_PLAN]` / `[CTA_BUTTONS]` / …, which every card prints as plain text.
/// The server already normalises its final text; this runs on the client for the part the stream shows before that (and for
/// replies saved before it did), at ONE place: `ContentParser.parse`.
enum MarkdownNormalize {

    // MARK: - Bold, per line

    private static func isSpace(_ c: Character) -> Bool { c.isWhitespace || c.isNewline }

    private struct Tok { let start: Int; let end: Int; let canOpen: Bool; let canClose: Bool }

    private static func removeStarRuns(_ s: String) -> String {
        s.replacingOccurrences(of: #"\*{2,}"#, with: "", options: .regularExpression)
    }

    /// Balance bold on ONE line: matched pairs survive (as canonical `**`), every unmatched `**` is dropped. A run of 3 counts
    /// as one delimiter; a run of 4+ is an empty pair and goes. Pairing is flanking-aware (see the web file for the cases).
    static func balanceBold(_ line: String) -> String {
        guard line.contains("**") else { return line }
        let chars = Array(line)
        let n = chars.count

        var toks: [Tok] = []
        var i = 0
        while i < n {
            if chars[i] == "*" {
                var j = i
                while j < n && chars[j] == "*" { j += 1 }
                if j - i >= 2 {
                    if j - i >= 4 {
                        toks.append(Tok(start: i, end: j, canOpen: false, canClose: false))
                    } else {
                        let before: Character? = i > 0 ? chars[i - 1] : nil
                        let after: Character? = j < n ? chars[j] : nil
                        toks.append(Tok(start: i, end: j,
                                        canOpen: after.map { !isSpace($0) } ?? false,
                                        canClose: before.map { !isSpace($0) } ?? false))
                    }
                }
                i = j
            } else {
                i += 1
            }
        }

        var pairs: [(Int, Int)] = []
        var pending: Int?
        for (k, t) in toks.enumerated() {
            if t.end - t.start >= 4 { continue }
            let neither = !t.canOpen && !t.canClose
            if let open = pending {
                if t.canClose || neither { pairs.append((open, k)); pending = nil } else { pending = k }
            } else if t.canOpen || neither {
                pending = k
            }
        }

        var openAt = Set<Int>()
        for (o, c) in pairs { openAt.insert(toks[o].start); _ = c }
        var out = ""
        var at = 0
        var k = 0
        while k < toks.count {
            let t = toks[k]
            if openAt.contains(t.start), let pair = pairs.first(where: { $0.0 == k }) {
                let close = toks[pair.1]
                let inner = String(chars[t.end..<close.start]).trimmingCharacters(in: .whitespacesAndNewlines)
                out += String(chars[at..<t.start])
                let clean = removeStarRuns(inner).trimmingCharacters(in: .whitespacesAndNewlines)
                out += clean.isEmpty ? "" : "**\(clean)**"
                at = close.end
                if clean.isEmpty, t.start > 0, isSpace(chars[t.start - 1]), at < n, chars[at] == " " { at += 1 }
                k = pair.1 + 1
                continue
            }
            // An unmatched delimiter is dropped; a free-standing one (" ** ") takes one space with it.
            out += String(chars[at..<t.start])
            at = t.end
            if t.start > 0, isSpace(chars[t.start - 1]), at < n, chars[at] == " " { at += 1 }
            k += 1
        }
        out += String(chars[at...])
        return out
    }

    /// `balanceBold` on every line (bold never spans a line break).
    static func balanceBoldPerLine(_ text: String) -> String {
        guard text.contains("**") else { return text }
        return text.components(separatedBy: "\n").map(balanceBold).joined(separator: "\n")
    }

    // MARK: - Plain text for card fields

    private static func replace(_ s: String, _ pattern: String, _ template: String) -> String {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return s }
        return re.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: template)
    }

    /// Markdown-free text for a card field that prints a model string as PLAIN text: bold/underline delimiters, code ticks,
    /// heading hashes, word-flanking single `*` / `_` emphasis; a markdown link becomes its label. Never touches «2*3».
    static func plainText(_ s: String) -> String {
        guard !s.isEmpty, s.rangeOfCharacter(from: CharacterSet(charactersIn: "*_`#[")) != nil else { return s }
        var t = s
        t = replace(t, #"!?\[([^\]\n]*)\]\((?:[^)\s]*)\)"#, "$1")
        t = replace(t, #"\*{2,}"#, "")
        t = replace(t, #"(^|[\s(])__(?=\S)|(?<=\S)__(?=[\s).,;:!?]|$)"#, "$1")
        t = replace(t, #"`+"#, "")
        t = replace(t, #"(^|\n)\s*#{1,6}\s+"#, "$1")
        t = replace(t, #"(^|[\s(])\*(?=\S)|(?<=\S)\*(?=[\s).,;:!?]|$)"#, "$1")
        t = replace(t, #"(^|[\s(])_(?=[^\s_])([^_\n]+?)_(?=[\s).,;:!?]|$)"#, "$1$2")
        t = replace(t, #"[ \t]{2,}"#, " ")
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Keys whose values are addresses, ids or enums — never prose, never rewritten.
    private static let nonProseKey = try? NSRegularExpression(
        pattern: #"((^|_)(url|urls|link|links|href|uri|image|images|photo|photos|id|ids|key|type|kind|category|icon|currency|basis)$)|([a-z](Url|Urls|Link|Links|Id|Ids|Key|Type|Kind)$)"#,
        options: [.caseInsensitive])

    private static func isNonProseKey(_ key: String) -> Bool {
        guard let re = nonProseKey else { return false }
        return re.firstMatch(in: key, range: NSRange(key.startIndex..., in: key)) != nil
    }

    private static func isAddress(_ s: String) -> Bool {
        let l = s.lowercased()
        return l.hasPrefix("http:") || l.hasPrefix("https:") || l.hasPrefix("mailto:") || l.hasPrefix("tel:")
    }

    private static func stripJson(_ value: Any, key: String) -> Any {
        if let s = value as? String {
            return isNonProseKey(key) || isAddress(s) ? s : plainText(s)
        }
        if let a = value as? [Any] { return a.map { stripJson($0, key: key) } }
        if let d = value as? [String: Any] {
            var out: [String: Any] = [:]
            for (k, v) in d {
                // A key is only rewritten when it carries bold/code markup («**Ăn uống**» in cost_breakdown).
                let nk = (k.contains("*") || k.contains("`")) ? plainText(k) : k
                out[nk] = stripJson(v, key: k)
            }
            return out
        }
        return value
    }

    /// The body of one marker block with markdown stripped from its prose strings. Byte-identical when nothing changed; never
    /// string surgery on something that is not JSON.
    private static func normalizeBlockBody(_ name: String, _ body: String) -> String {
        if name == "FOLLOWUPS" {
            return body.components(separatedBy: "|").map { plainText($0) }.joined(separator: "|")
        }
        guard let data = body.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else { return body }
        let stripped = stripJson(parsed, key: "")
        if (stripped as AnyObject).isEqual(parsed) { return body }
        guard let out = try? JSONSerialization.data(withJSONObject: stripped, options: [.withoutEscapingSlashes, .fragmentsAllowed]),
              let text = String(data: out, encoding: .utf8) else { return body }
        return text
    }

    // MARK: - Half-accented price words

    /// «ngan sách» / «ngân sach» / «gia cụ thể»: the model blends accented and unaccented spellings. Only a HALF-accented pair is
    /// fixed. Same length in and out.
    static func fixHalfAccented(_ text: String) -> String {
        var t = text
        t = replace(t, #"(?<!\p{L})([Nn])gan(\s+)(sách)(?!\p{L})"#, "$1gân$2$3")
        t = replace(t, #"(?<!\p{L})([Nn])gân(\s+)sach(?!\p{L})"#, "$1gân$2sách")
        t = replace(t, #"(?<!\p{L})([Gg])ia(\s+)(cụ thể|vé|phòng|tiền|rẻ|niêm yết)(?!\p{L})"#, "$1iá$2$3")
        return t
    }

    // MARK: - The reply as the user must see it

    private static let block = try? NSRegularExpression(pattern: #"\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]([\s\S]*?)\[/\1\]"#)
    private static let openMarker = try? NSRegularExpression(pattern: #"\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]"#)

    /// Prose bold balanced per line; marker blocks kept in place with markdown stripped from their string values. An UNCLOSED
    /// block (a truncated reply) and everything after it is left exactly as it is.
    static func normalizeReply(_ input: String) -> String {
        guard !input.isEmpty else { return input }
        let text = fixHalfAccented(input)
        guard text.rangeOfCharacter(from: CharacterSet(charactersIn: "*_`#[")) != nil, let block else { return text }
        let ns = text as NSString
        var out = ""
        var at = 0
        for m in block.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            out += balanceBoldPerLine(ns.substring(with: NSRange(location: at, length: m.range.location - at)))
            let name = ns.substring(with: m.range(at: 1))
            let body = ns.substring(with: m.range(at: 2))
            out += "[\(name)]\(normalizeBlockBody(name, body))[/\(name)]"
            at = m.range.location + m.range.length
        }
        let rest = ns.substring(from: at)
        if let open = openMarker?.firstMatch(in: rest, range: NSRange(location: 0, length: (rest as NSString).length)) {
            let r = rest as NSString
            out += balanceBoldPerLine(r.substring(to: open.range.location)) + r.substring(from: open.range.location)
        } else {
            out += balanceBoldPerLine(rest)
        }
        return out
    }
}
