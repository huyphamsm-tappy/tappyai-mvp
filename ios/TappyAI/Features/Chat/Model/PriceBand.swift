import Foundation

/// The provider's own price range for a venue, read the way a person reads it (web `src/lib/recommendation/priceBand.ts`, `formatPriceBandText`).
/// Google's text is "100-200 N ₫", "Trên 1 Tr ₫" or "1-100.000 ₫": the last one is an open lower bound ("up to 100.000"), not "from one đồng", and the
/// card shows it as "dưới 100.000 ₫". A shape the parser does not know is shown verbatim: never hidden, never guessed. Pure.
enum PriceBand {
    struct Band: Equatable, Sendable {
        let lo: Double
        let hi: Double
        enum Open { case above, below }
        let open: Open?
    }

    private static let scale: [String: Double] = ["n": 1e3, "k": 1e3, "nghìn": 1e3, "ngàn": 1e3, "tr": 1e6, "m": 1e6, "triệu": 1e6]
    private static let num = #"(\d+(?:[.,]\d+)*)"#
    private static let unit = #"(N|K|Tr|M|nghìn|ngàn|triệu)?"#
    private static let range = try? NSRegularExpression(pattern: #"^\s*"# + num + #"\s*[-–]\s*"# + num + #"\s*"# + unit + #"\s*₫\s*$"#, options: .caseInsensitive)
    private static let above = try? NSRegularExpression(pattern: #"^\s*(?:Trên|Tren|Over|Above|>)\s*"# + num + #"\s*"# + unit + #"\s*₫\s*$"#, options: .caseInsensitive)
    private static let below = try? NSRegularExpression(pattern: #"^\s*(?:Dưới|Duoi|Under|Below|<)\s*"# + num + #"\s*"# + unit + #"\s*₫\s*$"#, options: .caseInsensitive)

    /// "100" is 100, "100.000" is 100000, "1,5" is 1.5 (a scale unit follows).
    static func amount(_ raw: String, scaled: Bool) -> Double? {
        let seps = raw.filter { $0 == "." || $0 == "," }
        if seps.count >= 2 { return Double(raw.filter { $0 != "." && $0 != "," }) }
        if seps.count == 1 {
            let frac = raw.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "." || $0 == "," }).last.map(String.init) ?? ""
            if frac.count == 3 && !scaled { return Double(raw.filter { $0 != "." && $0 != "," }) }
            return Double(raw.replacingOccurrences(of: ",", with: "."))
        }
        return Double(raw)
    }

    private static func groups(_ regex: NSRegularExpression?, _ text: String) -> [String?]? {
        guard let regex, let m = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        return (1..<m.numberOfRanges).map { i in Range(m.range(at: i), in: text).map { String(text[$0]) } }
    }

    /// The largest bound a band may state (ten trillion đồng): a provider text beyond it is shown verbatim, and no integer conversion can trap.
    static let maxBound = 1e13

    static func parse(_ text: String?) -> Band? {
        guard let band = parseUnchecked(text), band.lo <= maxBound, band.hi <= maxBound || band.hi == .infinity else { return nil }
        return band
    }

    private static func parseUnchecked(_ text: String?) -> Band? {
        guard let source = text?.trimmingCharacters(in: .whitespacesAndNewlines), !source.isEmpty else { return nil }
        if let g = groups(range, source), let a = g[0], let b = g[1] {
            let s = scale[(g[2] ?? "").lowercased()] ?? 1
            guard let lo = amount(a, scaled: s > 1).map({ $0 * s }), let hi = amount(b, scaled: s > 1).map({ $0 * s }),
                  lo.isFinite, hi.isFinite, hi > 0, lo <= hi else { return nil }
            return lo <= 1 ? Band(lo: 0, hi: hi, open: .below) : Band(lo: lo, hi: hi, open: nil)
        }
        if let g = groups(above, source), let a = g[0] {
            let s = scale[(g[1] ?? "").lowercased()] ?? 1
            guard let lo = amount(a, scaled: s > 1).map({ $0 * s }), lo.isFinite, lo > 0 else { return nil }
            return Band(lo: lo, hi: .infinity, open: .above)
        }
        if let g = groups(below, source), let a = g[0] {
            let s = scale[(g[1] ?? "").lowercased()] ?? 1
            guard let hi = amount(a, scaled: s > 1).map({ $0 * s }), hi.isFinite, hi > 0 else { return nil }
            return Band(lo: 0, hi: hi, open: .below)
        }
        return nil
    }

    /// "100.000" or "1,5 triệu": the way a Vietnamese reader writes an amount (`lang` is `vi` or `en`).
    static func vnd(_ n: Double, lang: String) -> String {
        let vi = lang == "vi"
        guard n.isFinite, n <= maxBound else { return String(format: "%.0f", n.isFinite ? n : 0) }
        if n >= 1_000_000 {
            let m = n / 1_000_000
            var s = m == m.rounded() ? String(Int(m)) : String(format: "%.1f", m)
            if s.hasSuffix(".0") { s.removeLast(2) }
            return vi ? s.replacingOccurrences(of: ".", with: ",") + " triệu" : s + "M"
        }
        return StayOfferLine.grouped(Int(n.rounded()), separator: vi ? "." : ",")
    }

    /// The band as a reader understands it, or the provider's own text when its shape is unknown; nil for an empty text.
    static func format(_ text: String?, lang: String) -> String? {
        guard let text, !text.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        guard let band = parse(text) else { return text }
        let vi = lang == "vi"
        switch band.open {
        case .below?: return (vi ? "dưới " : "under ") + vnd(band.hi, lang: lang) + " ₫"
        case .above?: return (vi ? "trên " : "over ") + vnd(band.lo, lang: lang) + " ₫"
        case nil: return vnd(band.lo, lang: lang) + "–" + vnd(band.hi, lang: lang) + " ₫"
        }
    }
}
