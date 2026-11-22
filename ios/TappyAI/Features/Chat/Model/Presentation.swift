import Foundation

/// The blocks the model may declare with the answer (web `src/lib/presentation/contract.ts` and its client reader `read.ts`, layout slices 2-3,
/// 14-16/11/2026): a comparison table, one card per named subject, a gallery of pictures, tap-to-send questions and a booking handoff. The server
/// sends them as the live `8:` annotation `tappy.presentation.v1` when it declares them (its flag `CONSULT_PRESENT_BLOCKS`); a server that does not
/// send the frame leaves the answer as plain text, exactly as before.
///
/// The app trusts nothing in the frame. Every field is read again with the web's own limits: one line, no control characters, no protocol marker,
/// bounded sizes. A card carries no link of its own: a booking is drawn only when the server attached an `https` partner link for ITS id. Pure.
let presentationAnnotationKind = "tappy.presentation.v1"

enum PresentationBlock: Equatable, Sendable, Identifiable {
    /// A table the model asked for: columns are the options, rows the criteria; `pick` is the recommended column.
    case compare(id: String, title: String?, columns: [String], rows: [CompareRow], pick: Int?)
    /// One card per named subject of a comparison or a list.
    case profiles(id: String, title: String?, items: [ProfileItem])
    /// Two or three pictures that show what the answer is about. A caption and the words to find the picture; the pictures come from the server.
    case gallery(id: String, title: String?, items: [GalleryItem])
    /// Up to three short questions with options the person can tap.
    case ask(id: String, questions: [AskQuestion])
    /// A "book it" handoff; the link is the server's, by this block's id.
    case booking(id: String, kind: BookingKind, title: String, detail: String?, providerId: String?, ref: String)

    var id: String {
        switch self {
        case .compare(let id, _, _, _, _), .profiles(let id, _, _), .gallery(let id, _, _), .ask(let id, _), .booking(let id, _, _, _, _, _): return id
        }
    }

    struct CompareRow: Equatable, Sendable { let label: String; let cells: [String] }
    struct ProfilePoint: Equatable, Sendable { let lead: String?; let text: String }
    /// `sources` are NAMES of the sites the points came from, never an address.
    struct ProfileItem: Equatable, Sendable { let name: String; let subtitle: String?; let points: [ProfilePoint]; let sources: [String] }
    struct GalleryItem: Equatable, Sendable { let caption: String; let query: String }
    struct AskQuestion: Equatable, Sendable { let text: String; let options: [String] }

    enum BookingKind: String, Equatable, Sendable { case flight, hotel, transport, ticket, activity, product }
}

/// The partner link of a booking block (web `BookingLink`).
struct PresentationBookingLink: Equatable, Sendable {
    let url: URL
    let label: String
    let providerId: String
    /// `guest`, `merchant_login` (needs a login on the partner's site) or `app` (opens in the partner's app).
    let handoff: String
}

/// The checked frame: the blocks and the booking links by block id.
struct PresentationFrame: Equatable, Sendable {
    let blocks: [PresentationBlock]
    let links: [String: PresentationBookingLink]

    /// The subject cards the model declared replace the server's own subject row (web: `entities && !profilesNode`): one look, never both.
    var hasProfiles: Bool { blocks.contains { if case .profiles = $0 { return true } else { return false } } }
}

enum PresentationFrames {
    static let maxBlocks = 12

    // The web's limits (contract.ts).
    private static let maxTitle = 160, maxColumns = 6, maxRows = 12, maxCol = 60, maxLabel = 80, maxCell = 200
    private static let maxProfiles = 6, maxPoints = 6, maxName = 80, maxSubtitle = 120, maxLead = 60, maxPoint = 260
    private static let maxSourceNames = 5, maxSourceName = 60
    private static let minGallery = 2, maxGallery = 3, maxCaption = 80, maxQuery = 100
    private static let maxQuestions = 3, maxOptions = 6, maxQuestion = 200, maxOption = 60, maxDetail = 240

    private static let refPattern = try? NSRegularExpression(pattern: #"^[A-Za-z0-9_.:-]{1,64}$"#)
    private static let providerPattern = try? NSRegularExpression(pattern: #"^[a-z0-9_]{1,40}$"#)

    /// The frame of one `8:` annotation element, or nil when nothing drawable is in it. Never throws.
    static func frame(_ item: [String: Any]) -> PresentationFrame? {
        guard (item["kind"] as? String) == presentationAnnotationKind, (item["v"] as? Int) == 1,
              let presentation = item["presentation"] as? [String: Any],
              let rawBlocks = presentation["blocks"] as? [Any] else { return nil }
        let rawLinks = item["links"] as? [String: Any] ?? [:]
        var blocks: [PresentationBlock] = []
        var links: [String: PresentationBookingLink] = [:]
        for raw in rawBlocks.prefix(maxBlocks) {
            guard let object = raw as? [String: Any], let block = block(object) else { continue }
            if case .booking(let id, _, _, _, _, _) = block {
                // a booking card is always actionable: without a valid link for its id it is dropped
                guard let link = bookingLink(rawLinks[id]) else { continue }
                links[id] = link
            }
            blocks.append(block)
        }
        return blocks.isEmpty ? nil : PresentationFrame(blocks: blocks, links: links)
    }

    // MARK: Blocks

    private static func block(_ raw: [String: Any]) -> PresentationBlock? {
        guard let id = raw["id"] as? String, (1...64).contains(id.count) else { return nil }
        switch raw["type"] as? String {
        case "compare": return compare(id, raw)
        case "profiles": return profiles(id, raw)
        case "gallery": return gallery(id, raw)
        case "ask": return ask(id, raw)
        case "booking": return booking(id, raw)
        default: return nil   // places / plan / media / report ride other channels; an unknown type draws nothing
        }
    }

    private static func compare(_ id: String, _ raw: [String: Any]) -> PresentationBlock? {
        guard let cols = raw["columns"] as? [Any], (2...maxColumns).contains(cols.count) else { return nil }
        var columns: [String] = []
        for c in cols { guard let t = text(c, maxCol) else { return nil }; columns.append(t) }
        guard let rawRows = raw["rows"] as? [Any] else { return nil }
        var rows: [PresentationBlock.CompareRow] = []
        for r in rawRows.prefix(200) {
            guard rows.count < maxRows, let o = r as? [String: Any], let cells = o["cells"] as? [Any], cells.count == columns.count,
                  let label = text(o["label"], maxLabel) else { continue }
            let cleaned = cells.map { text($0, maxCell) }
            if cleaned.contains(where: { $0 == nil }) { continue }
            rows.append(.init(label: label, cells: cleaned.compactMap { $0 }))
        }
        guard !rows.isEmpty else { return nil }
        var pick: Int?
        if let rawPick = raw["pick"] {
            // a pick that is not a column index makes the whole block unusable (the web refuses it too)
            guard let n = rawPick as? Int, n >= 0, n < columns.count else { return nil }
            pick = n
        }
        let title = raw["title"] == nil ? nil : text(raw["title"], maxTitle)
        return .compare(id: id, title: title, columns: columns, rows: rows, pick: pick)
    }

    private static func profiles(_ id: String, _ raw: [String: Any]) -> PresentationBlock? {
        guard let rawItems = raw["items"] as? [Any] else { return nil }
        var items: [PresentationBlock.ProfileItem] = []
        var names = Set<String>()
        for entry in rawItems.prefix(200) {
            guard items.count < maxProfiles, let it = entry as? [String: Any], let rawPoints = it["points"] as? [Any],
                  let name = text(it["name"], maxName), !names.contains(name.lowercased()) else { continue }
            var points: [PresentationBlock.ProfilePoint] = []
            for p in rawPoints.prefix(200) {
                guard points.count < maxPoints, let po = p as? [String: Any], let body = text(po["text"], maxPoint) else { continue }
                points.append(.init(lead: po["lead"] == nil ? nil : text(po["lead"], maxLead), text: body))
            }
            guard !points.isEmpty else { continue }
            var sources: [String] = []
            for s in (it["sources"] as? [Any] ?? []).prefix(200) {
                // a source is a NAME: an address is not accepted, a card carries no link
                guard sources.count < maxSourceNames, let n = text(s, maxSourceName), !hasAddress(n), !sources.contains(n) else { continue }
                sources.append(n)
            }
            names.insert(name.lowercased())
            items.append(.init(name: name, subtitle: it["subtitle"] == nil ? nil : text(it["subtitle"], maxSubtitle), points: points, sources: sources))
        }
        guard !items.isEmpty else { return nil }
        return .profiles(id: id, title: raw["title"] == nil ? nil : text(raw["title"], maxTitle), items: items)
    }

    private static func gallery(_ id: String, _ raw: [String: Any]) -> PresentationBlock? {
        // the model declares `images`; the contract carries them as `items`: both are read, so a parsed block parses again
        guard let list = (raw["images"] as? [Any]) ?? (raw["items"] as? [Any]) else { return nil }
        var items: [PresentationBlock.GalleryItem] = []
        var seen = Set<String>()
        for entry in list.prefix(200) {
            guard items.count < maxGallery, let it = entry as? [String: Any], let caption = text(it["caption"], maxCaption),
                  let query = text(it["query"], maxQuery), !hasAddress(query), !seen.contains(caption.lowercased()) else { continue }
            seen.insert(caption.lowercased())
            items.append(.init(caption: caption, query: query))
        }
        guard items.count >= minGallery else { return nil }
        return .gallery(id: id, title: raw["title"] == nil ? nil : text(raw["title"], maxTitle), items: items)
    }

    private static func ask(_ id: String, _ raw: [String: Any]) -> PresentationBlock? {
        guard let rawQuestions = raw["questions"] as? [Any] else { return nil }
        var questions: [PresentationBlock.AskQuestion] = []
        for q in rawQuestions.prefix(200) {
            guard questions.count < maxQuestions, let o = q as? [String: Any], let options = o["options"] as? [Any],
                  let question = text(o["text"], maxQuestion) else { continue }
            var kept: [String] = []
            for opt in options.prefix(200) {
                guard kept.count < maxOptions, let t = text(opt, maxOption), !kept.contains(t) else { continue }
                kept.append(t)
            }
            if !kept.isEmpty { questions.append(.init(text: question, options: kept)) }
        }
        return questions.isEmpty ? nil : .ask(id: id, questions: questions)
    }

    private static func booking(_ id: String, _ raw: [String: Any]) -> PresentationBlock? {
        guard let kindName = raw["kind"] as? String, let kind = PresentationBlock.BookingKind(rawValue: kindName),
              let title = text(raw["title"], maxTitle), let ref = raw["ref"] as? String, matches(refPattern, ref) else { return nil }
        let detail = raw["detail"] == nil ? nil : text(raw["detail"], maxDetail)
        var providerId: String?
        if let rawProvider = raw["providerId"] {
            guard let p = rawProvider as? String, matches(providerPattern, p) else { return nil }
            providerId = p
        }
        return .booking(id: id, kind: kind, title: title, detail: detail, providerId: providerId, ref: ref)
    }

    // MARK: The booking link

    /// The partner link the server attached for a booking: `https`, a label, a provider id and a known handoff. Anything else is no link.
    static func bookingLink(_ raw: Any?) -> PresentationBookingLink? {
        guard let o = raw as? [String: Any], let urlString = o["url"] as? String, urlString.count <= 2000,
              let url = safeWebURL(urlString), url.scheme?.lowercased() == "https",
              let label = (o["label"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty, label.count <= 80,
              let providerId = o["providerId"] as? String, providerId.count <= 40,
              let handoff = o["handoff"] as? String, ["guest", "merchant_login", "app"].contains(handoff) else { return nil }
        return PresentationBookingLink(url: url, label: label, providerId: providerId, handoff: handoff)
    }

    // MARK: Text

    /// One line of plain text, control characters removed, bounded. A protocol marker inside makes the value unusable (nil): a card must not
    /// smuggle a marker into the answer.
    static func text(_ any: Any?, _ max: Int) -> String? {
        guard let s = any as? String else { return nil }
        var spaced = ""
        for scalar in s.unicodeScalars {
            if scalar == "\n" || scalar == "\r" || scalar == "\t" { spaced.unicodeScalars.append(" ") }
            else if scalar.value < 0x20 || scalar.value == 0x7f { continue }
            else { spaced.unicodeScalars.append(scalar) }
        }
        let t = spaced.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        let lower = t.lowercased()
        if lower.contains("[tappy_") || lower.contains("[/tappy_") { return nil }
        return String(t.prefix(max))
    }

    private static func hasAddress(_ s: String) -> Bool {
        let l = s.lowercased()
        return l.contains("http://") || l.contains("https://") || l.contains("www.")
    }

    private static func matches(_ regex: NSRegularExpression?, _ s: String) -> Bool {
        guard let regex else { return false }
        return regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }
}
