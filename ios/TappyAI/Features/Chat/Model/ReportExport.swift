import Foundation

// The finished Deep Research report as a file the person keeps (owner 31/10 on the web: "document, pdf và markdown"; the phone starts with
// Markdown, PDF and Word follow). Built on the phone from what is on screen - the report text, the card's https sources, the charts' checked
// figures - and saved where the person chooses; nothing is sent anywhere. A port of the web's reportExport.ts / reportChart.ts (`chartTable`)
// and of Android's ReportExport.kt. Pure functions: no UI, no state.

// MARK: - Small regex helpers (NSRegularExpression: ICU, the same dialect the web's and Android's patterns were written in)

private func regexReplace(_ s: String, _ pattern: String, _ template: String) -> String {
    s.replacingOccurrences(of: pattern, with: template, options: .regularExpression)
}

/// The groups of the first match of `pattern` in `s` (group 0 first; a group that did not take part is ""), or nil when there is none.
private func firstMatch(_ pattern: String, in s: String) -> [String]? {
    guard let re = try? NSRegularExpression(pattern: pattern) else { return nil }
    let ns = s as NSString
    guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
    return (0..<m.numberOfRanges).map { i in
        m.range(at: i).location == NSNotFound ? "" : ns.substring(with: m.range(at: i))
    }
}

private func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

// MARK: - Names

/// A file name from the report title: letters, digits, spaces and dashes only, at most 60 characters (web `reportFileName`).
func reportFileName(_ title: String, _ ext: String) -> String {
    let composed = title.precomposedStringWithCanonicalMapping
    let spaced = regexReplace(composed, #"[^\p{L}\p{N} -]+"#, " ")
    let collapsed = regexReplace(spaced, #"\s+"#, " ")
    let base = trimmed(String(trimmed(collapsed).prefix(60)))
    return "\(base.isEmpty ? "report" : base).\(ext)"
}

/// A link label: no bracket or backslash or line break that would end the label early in a reader of `[label](address)`.
private func mdLabel(_ s: String) -> String {
    trimmed(regexReplace(regexReplace(s, #"[\[\]\\\n]"#, " "), #"\s+"#, " "))
}

// MARK: - Titles (web `titleKey` / `cleanTitle`, as Android ArticleLayout.kt; named `answerTitleKey` / `answerCleanTitle` here because
// `titleKey` is already a member name in the app (ChatMode, tabs) and a global of that name would be shadowed inside those types)

/// The web's `titleKey`: accents, đ, case and punctuation aside, so a title matches in any script.
func answerTitleKey(_ s: String) -> String {
    let decomposed = s.decomposedStringWithCompatibilityMapping
    let noMarks = regexReplace(decomposed, #"\p{M}+"#, "")
    let d = noMarks.replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d")
    let words = regexReplace(d.lowercased(), #"[^\p{L}\p{N}]+"#, " ")
    return trimmed(words)
}

private let leadSymbols = #"^[\s\p{So}\p{Sk}\p{Sm}\p{Sc}\x{FE0F}\x{200D}]+"#
private let leadNumber = #"^\d{1,3}[.)]\s*"#
private let titleCut = #"\s*[:：]\s+|\s+[–—-]\s+|\s+\(|\s+\|\s+|[:：]\s*$"#

/// A title's own words: no leading number / emoji / symbol, cut at the first separator (web `cleanTitle`).
func answerCleanTitle(_ s: String) -> String {
    var t = s.replacingOccurrences(of: "**", with: "")
    t = regexReplace(t, leadSymbols, "")
    t = regexReplace(t, leadNumber, "")
    t = regexReplace(t, leadSymbols, "")
    if let re = try? NSRegularExpression(pattern: titleCut) {
        let ns = t as NSString
        if let m = re.firstMatch(in: t, range: NSRange(location: 0, length: ns.length)) {
            t = ns.substring(to: m.range.location)
        }
    }
    t = regexReplace(t, #"[\s.,;:!?：]+$"#, "")
    return trimmed(t)
}

// MARK: - Markdown

/// The report as Markdown: the text as written, with the numbered lines of its LAST section (the sources list the server built, "n. title —
/// site") turned into links to the card's sources of the same number. A number without a safe https link stays as text.
func reportMarkdown(_ text: String, _ links: [ResearchLink]) -> String {
    let lines = regexReplace(text, #"\r\n?"#, "\n").components(separatedBy: "\n")
    let last = lines.lastIndex { firstMatch(#"^\s{0,3}#{1,6}\s"#, in: $0) != nil } ?? -1
    var byId: [Int: ResearchLink] = [:]
    for link in links where OneBrainFrames.isSafeHttpsUrl(link.url) { byId[link.id] = link }
    let out: [String] = lines.enumerated().map { i, line in
        if i <= last { return line }
        guard let m = firstMatch(#"^(\d{1,3})\.\s+(.*)$"#, in: line),
              let id = Int(m[1]), let link = byId[id] else { return line }
        let label = mdLabel(link.title).isEmpty ? mdLabel(m[2]) : mdLabel(link.title)
        // a "(" or ")" in the address ends it early in every reader of [label](address); %28 / %29 is the same address
        let address = link.url.replacingOccurrences(of: "(", with: "%28").replacingOccurrences(of: ")", with: "%29")
        return "\(m[1]). [\(label)](\(address))"
    }
    return trimmed(out.joined(separator: "\n")) + "\n"
}

// MARK: - Figures

/// A figure as the report's language writes it (web `formatValue`: vi-VN / en-US, at most 2 decimals). Any language but "vi" is English.
func formatValue(_ v: Double, _ lang: String) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: lang == "vi" ? "vi_VN" : "en_US")
    f.numberStyle = .decimal
    f.minimumFractionDigits = 0
    f.maximumFractionDigits = 2
    return f.string(from: NSNumber(value: v)) ?? String(v)
}

/// One chart's figures as a Markdown table with its caption; each value keeps its source number (web `chartTable`).
func chartTable(_ c: ResearchChart, _ lang: String) -> String {
    func cell(_ s: String) -> String { s.replacingOccurrences(of: "|", with: "/").replacingOccurrences(of: "\n", with: " ") }
    let unit = c.unit.isEmpty ? "" : " \(cell(c.unit))"
    let rows = c.points.map { p in "| \(cell(p.label)) | \(formatValue(p.value, lang))\(unit) [\(p.source)] |" }.joined(separator: "\n")
    let head = lang == "vi" ? "| Mục | Giá trị |" : "| Item | Value |"
    let caption = "*\(lang == "vi" ? "Biểu đồ" : "Chart"): \(cell(c.title))*"
    return "\(head)\n|---|---|\n\(rows)\n\n\(caption)"
}

/// The report with each chart's figures as a table right under its section heading; a chart whose heading is not there is left out,
/// and a chart is placed once.
func withChartTables(_ text: String, _ charts: [ResearchChart], _ lang: String) -> String {
    if charts.isEmpty { return text }
    var left: [String: ResearchChart] = [:]
    for c in charts {
        let key = answerTitleKey(c.section)
        if left[key] == nil { left[key] = c }
    }
    return text.components(separatedBy: "\n").map { line -> String in
        guard let h = firstMatch(#"^\s{0,3}#{2,6}\s+(.+?)\s*#*\s*$"#, in: line) else { return line }
        let key = answerTitleKey(answerCleanTitle(h[1]))
        guard !key.isEmpty, let c = left.removeValue(forKey: key) else { return line }
        return "\(line)\n\n\(chartTable(c, lang))\n"
    }.joined(separator: "\n")
}
