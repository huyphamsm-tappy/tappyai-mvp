import Foundation

// The one-brain stream's Deep Research annotations, re-checked the way the web client re-checks them
// (`readResearchStatus` / `readResearchCharts`, src/lib/ai/research/deepResearch.ts; `sanitizeDocMedia`, src/lib/answerDoc/media.ts)
// and the way Android does (`OneBrainFrames.kt`). The server already checked all of it; the client trusts nothing it would show.
// A value this version does not know drops THAT item (a step, a link, a point, a picture, a chart), never the frame around it.

/// The `type` of the Deep Research card frame. (`tappy.research.v1` and `tappy.research_charts.v1` are discriminated by `type`.)
let researchAnnotationType = "tappy.research.v1"
/// The `type` of the report's charts frame.
let researchChartsAnnotationType = "tappy.research_charts.v1"
/// The `kind` of the section / item pictures frame. (`tappy.doc_media.v1` is discriminated by `kind`, like the other annotations.)
let docMediaAnnotationKind = "tappy.doc_media.v1"

enum ResearchPhase: String, Equatable, Sendable {
    case planning, researching, writing, done, failed
}

enum ResearchStepStatus: String, Equatable, Sendable {
    case pending, running, done, failed
}

struct ResearchStep: Equatable, Sendable {
    let title: String
    let status: ResearchStepStatus
}

/// One cited source of the report: `id` is the number the text cites as `[id]`.
struct ResearchLink: Equatable, Sendable, Identifiable {
    let id: Int
    let title: String
    let url: String
}

/// The Deep Research card: the plan's title, its steps, the source count and (once done) the cited sources.
struct ResearchStatus: Equatable, Sendable {
    let title: String
    let phase: ResearchPhase
    let steps: [ResearchStep]
    let sources: Int
    var links: [ResearchLink] = []
}

enum ResearchChartKind: String, Equatable, Sendable {
    case bar, line
}

/// One figure of a chart; `source` is the id of the cited source it came from.
struct ChartPoint: Equatable, Sendable {
    let label: String
    let value: Double
    let source: Int
}

/// One chart of a report section, drawn by the client from figures the server checked in their own source.
struct ResearchChart: Equatable, Sendable {
    let section: String
    let title: String
    let unit: String
    let kind: ResearchChartKind
    let points: [ChartPoint]
}

enum DocMediaSource: String, Equatable, Sendable {
    case wikipedia, web
}

/// A picture of the answer (a report section, an item of a list answer): it goes under the heading whose `title` it carries.
struct DocMediaItem: Equatable, Sendable {
    let title: String
    let src: String
    let source: DocMediaSource
}

enum OneBrainFrames {
    static let maxSteps = 7
    static let maxLinks = 40
    static let maxCharts = 4
    static let maxChartPoints = 12
    static let maxMedia = 8

    /// The Deep Research card of one `tappy.research.v1` element; no known phase, no card.
    static func research(_ o: [String: Any]) -> ResearchStatus? {
        guard let phase = string(o["phase"]).flatMap({ ResearchPhase(rawValue: $0) }) else { return nil }
        let steps: [ResearchStep] = Array(array(o["steps"]).compactMap { element -> ResearchStep? in
            guard let step = element as? [String: Any],
                  let title = string(step["title"]),
                  let status = string(step["status"]).flatMap({ ResearchStepStatus(rawValue: $0) }) else { return nil }
            return ResearchStep(title: String(title.prefix(160)), status: status)
        }.prefix(maxSteps))
        let links: [ResearchLink] = Array(array(o["links"]).compactMap { element -> ResearchLink? in
            guard let link = element as? [String: Any],
                  let id = integer(link["id"]),
                  let title = string(link["title"]),
                  let url = string(link["url"]), url.count <= 2000, isSafeHttpsUrl(url) else { return nil }
            return ResearchLink(id: id, title: String(title.prefix(200)), url: url)
        }.prefix(maxLinks))
        var sources = 0
        if let n = number(o["sources"]), n >= 0, n < 1_000_000_000 { sources = Int(n) }
        return ResearchStatus(title: String(string(o["title"])?.prefix(160) ?? ""), phase: phase, steps: steps, sources: sources, links: links)
    }

    /// The charts of one `tappy.research_charts.v1` element: at most 4, each with 2 to 12 points.
    static func charts(_ o: [String: Any]) -> [ResearchChart] {
        Array(array(o["charts"]).compactMap { element -> ResearchChart? in
            guard let chart = element as? [String: Any] else { return nil }
            let points: [ChartPoint] = Array(array(chart["points"]).compactMap { raw -> ChartPoint? in
                guard let point = raw as? [String: Any],
                      let label = string(point["label"]),
                      let value = number(point["value"]),
                      let source = integer(point["source"]) else { return nil }
                return ChartPoint(label: clean(label, 40), value: value, source: source)
            }.prefix(maxChartPoints))
            guard let section = string(chart["section"]), let title = string(chart["title"]), points.count >= 2 else { return nil }
            return ResearchChart(section: clean(section, 80), title: clean(title, 80), unit: clean(string(chart["unit"]) ?? "", 24),
                                 kind: string(chart["kind"]) == "line" ? .line : .bar, points: points)
        }.prefix(maxCharts))
    }

    /// The pictures of one `tappy.doc_media.v1` element: version 1 only, at most 8, each with a title and a safe https address.
    static func docMedia(_ o: [String: Any]) -> [DocMediaItem] {
        guard number(o["v"]) == 1 else { return [] }
        return Array(array(o["items"]).compactMap { element -> DocMediaItem? in
            guard let item = element as? [String: Any] else { return nil }
            let title = clean(string(item["title"]) ?? "", 80, dropAngles: true)
            guard !title.isEmpty, let src = string(item["src"]), src.count <= 2048, isSafeHttpsUrl(src) else { return nil }
            return DocMediaItem(title: title, src: src, source: string(item["source"]) == "wikipedia" ? .wikipedia : .web)
        }.prefix(maxMedia))
    }

    /// The web's `isSafeHttpsUrl` (src/lib/security/urlGuard.ts): https, a host, no credentials, not an internal or private address;
    /// and, owner 01/11, never another AI product's page (`AiSourcePolicy`). Read as a string, not by `URLComponents`: an address
    /// with accented letters in its path (a Vietnamese Wikipedia title) is still an address.
    static func isSafeHttpsUrl(_ raw: String) -> Bool {
        guard raw.lowercased().hasPrefix("https://"),
              !raw.contains(where: { $0.isWhitespace || $0.isNewline }) else { return false }
        let authority = raw.dropFirst("https://".count).prefix(while: { $0 != "/" && $0 != "\\" && $0 != "?" && $0 != "#" })
        guard !authority.contains("@") else { return false }
        var host: String
        if authority.hasPrefix("[") {
            guard let close = authority.firstIndex(of: "]") else { return false }
            host = String(authority[authority.index(after: authority.startIndex)..<close])
        } else {
            host = String(authority.split(separator: ":", omittingEmptySubsequences: false).first ?? "")
        }
        host = host.lowercased()
        while host.hasSuffix(".") { host.removeLast() }
        guard !host.isEmpty else { return false }
        if host == "localhost" || host.hasSuffix(".localhost") || host.hasSuffix(".local") || host.hasSuffix(".internal") { return false }
        if host.contains(":") { return isPublicIPv6(host) }
        if host.split(separator: ".").contains(where: { $0.hasPrefix("0x") }) { return false }
        if host.allSatisfy({ $0 == "." || ($0.isASCII && $0.isNumber) }) {
            // An address: only a plain, public a.b.c.d. Shorter or longer spellings (`2130706433`) name a private one too often.
            let octets = host.split(separator: ".", omittingEmptySubsequences: false).compactMap { Int($0) }
            guard octets.count == 4, octets.allSatisfy({ $0 <= 255 }) else { return false }
            if !isPublicIPv4(octets[0], octets[1]) { return false }
        }
        return !AiSourcePolicy.isAiProductSource(raw)
    }

    private static func isPublicIPv4(_ a: Int, _ b: Int) -> Bool {
        if a == 0 || a == 10 || a == 127 { return false }
        if a == 169 && b == 254 { return false }
        if a == 172 && (16...31).contains(b) { return false }
        if a == 192 && b == 168 { return false }
        if a == 100 && (64...127).contains(b) { return false }
        return true
    }

    /// A literal IPv6 host: loopback, unspecified, IPv4-mapped (`::ffff:…`), unique-local and link-local are not public.
    private static func isPublicIPv6(_ h: String) -> Bool {
        if h.hasPrefix("::") || h.hasPrefix("0:") { return false }
        if h.hasPrefix("fc") || h.hasPrefix("fd") { return false }
        if h.hasPrefix("fe8") || h.hasPrefix("fe9") || h.hasPrefix("fea") || h.hasPrefix("feb") { return false }
        return true
    }

    // MARK: - Reading JSON values

    private static func string(_ v: Any?) -> String? { v as? String }

    private static func array(_ v: Any?) -> [Any] { (v as? [Any]) ?? [] }

    /// A JSON number, never a boolean (`true` arrives as an NSNumber too) and never NaN or infinity.
    private static func number(_ v: Any?) -> Double? {
        guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
        let d = n.doubleValue
        return d.isFinite ? d : nil
    }

    /// A JSON number that is a whole number.
    private static func integer(_ v: Any?) -> Int? {
        guard let d = number(v) else { return nil }
        return Int(exactly: d)
    }

    /// Control characters (and, when asked, angle brackets) become spaces, runs of white space collapse, the ends are trimmed, then it is cut.
    private static func clean(_ raw: String, _ max: Int, dropAngles: Bool = false) -> String {
        let spaced = String(raw.unicodeScalars.map { scalar -> Character in
            let blank = scalar.value < 0x20 || (dropAngles && (scalar == "<" || scalar == ">"))
            return blank ? " " : Character(scalar)
        })
        let collapsed = spaced.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return String(collapsed.prefix(max))
    }
}
