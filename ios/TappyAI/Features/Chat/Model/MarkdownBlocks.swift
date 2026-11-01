import Foundation

// An answer's Markdown cut into BLOCKS, the way the web draws it (formatMessage / ArticleAnswer) and Android's TappyMarkdown.parseBlocks does:
// headings, paragraphs, bullets (with depth), numbered lines, quotes, code, tables, rules. Pure functions - no UI, no state - so the rules
// are tested without a device. The SwiftUI side (`MarkdownBlocksView`) draws each block; the TEXT inside a block is read by
// `ContentParser.renderMarkdown` (bold, italic, code, links as http(s) only), so the inline rules stay in one place.

/// One block of an answer, in reading order.
enum MarkdownBlock: Equatable, Sendable {
    /// `level` 1...6 as written; the text is the heading's own words (no `#`, no closing `#`).
    case heading(level: Int, text: String)
    /// Consecutive plain lines, kept as lines (a line break the model wrote is a line break on screen).
    case paragraph(String)
    /// A `-`, `*`, `+` or `•` line; `depth` from its indentation (two spaces a level, at most 3).
    case bullet(depth: Int, text: String)
    /// A `1.` / `1)` line with the model's own number (a list a paragraph broke keeps counting).
    case numbered(n: Int, depth: Int, text: String)
    case quote(String)
    /// A fenced block, its lines as written.
    case code(lines: [String])
    /// Header row first, then the body rows; the separator row is gone, cells are trimmed, every row has the header's columns.
    case table(rows: [[String]])
    case rule
}

private let mdbHeading = try? NSRegularExpression(pattern: #"^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$"#)
private let mdbBullet = try? NSRegularExpression(pattern: #"^(\s*)[-*+•]\s+(.*)$"#)
private let mdbNumbered = try? NSRegularExpression(pattern: #"^(\s*)(\d{1,3})[.)]\s+(.*)$"#)
private let mdbQuote = try? NSRegularExpression(pattern: #"^\s*>\s?(.*)$"#)
private let mdbRule = try? NSRegularExpression(pattern: #"^\s*([-*_])\1{2,}\s*$"#)
private let mdbTableSeparator = try? NSRegularExpression(pattern: #"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$"#)

/// The groups of the first match (group 0 first; a group that did not take part is ""), or nil.
private func mdbGroups(_ re: NSRegularExpression?, _ s: String) -> [String]? {
    guard let re else { return nil }
    let ns = s as NSString
    guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
    return (0..<m.numberOfRanges).map { i in
        m.range(at: i).location == NSNotFound ? "" : ns.substring(with: m.range(at: i))
    }
}

private func mdbTrim(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

private func mdbIsFence(_ line: String) -> Bool { line.trimmingCharacters(in: .whitespaces).hasPrefix("```") }

/// Two spaces a level (a tab counts as four), at most 3 levels.
private func mdbDepth(_ indent: String) -> Int {
    let width = indent.reduce(0) { $0 + ($1 == "\t" ? 4 : 1) }
    return min(width / 2, 3)
}

/// A table starts at a row with a pipe whose next line is a separator row with a pipe (`|---|:---:|`); a pipe line without that stays text.
private func mdbIsTableStart(_ lines: [String], _ i: Int) -> Bool {
    i + 1 < lines.count && lines[i].contains("|") && lines[i + 1].contains("|") && mdbGroups(mdbTableSeparator, lines[i + 1]) != nil
}

private func mdbCells(_ line: String) -> [String] {
    var t = mdbTrim(line)
    if t.hasPrefix("|") { t.removeFirst() }
    if t.hasSuffix("|") { t.removeLast() }
    return t.components(separatedBy: "|").map { mdbTrim($0) }
}

/// Whether the line at `i` begins a block of its own (so a paragraph before it ends there).
private func mdbStartsOtherBlock(_ lines: [String], _ i: Int) -> Bool {
    let line = lines[i]
    return mdbIsFence(line) || mdbGroups(mdbRule, line) != nil || mdbGroups(mdbHeading, line) != nil
        || mdbGroups(mdbQuote, line) != nil || mdbGroups(mdbBullet, line) != nil || mdbGroups(mdbNumbered, line) != nil
        || mdbIsTableStart(lines, i)
}

enum MarkdownBlocks {

    /// The Markdown cut into blocks. A heading stuck to the list under it is a block of its own; a table starting under a sentence is
    /// recognised; a code block (even one still open while the reply streams) keeps its lines as written.
    static func parse(_ markdown: String) -> [MarkdownBlock] {
        let normalised = markdown.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        // bold balanced per line, as the chat always did - except a code block's lines and a "***" rule, which are not prose
        var inFence = false
        let lines: [String] = normalised.components(separatedBy: "\n").map { line in
            if mdbIsFence(line) { inFence.toggle(); return line }
            if inFence || mdbGroups(mdbRule, line) != nil { return line }
            return MarkdownNormalize.balanceBold(line)
        }
        var out: [MarkdownBlock] = []
        var i = 0
        while i < lines.count {
            let line = lines[i]
            if mdbTrim(line).isEmpty {
                i += 1
            } else if mdbIsFence(line) {
                var code: [String] = []
                i += 1
                while i < lines.count && !mdbIsFence(lines[i]) {
                    code.append(lines[i])
                    i += 1
                }
                i += 1 // the closing fence (absent while the reply is still arriving)
                while let last = code.last, mdbTrim(last).isEmpty { code.removeLast() }
                out.append(.code(lines: code))
            } else if mdbIsTableStart(lines, i) {
                let header = mdbCells(line)
                var rows: [[String]] = [header]
                i += 2 // the header and its separator
                while i < lines.count && !mdbTrim(lines[i]).isEmpty && lines[i].contains("|") {
                    let cells = mdbCells(lines[i])
                    // a short row is padded, a long one cut: every row has the header's columns
                    rows.append((0..<header.count).map { k in k < cells.count ? cells[k] : "" })
                    i += 1
                }
                out.append(.table(rows: rows))
            } else if mdbGroups(mdbRule, line) != nil {
                out.append(.rule)
                i += 1
            } else if let m = mdbGroups(mdbHeading, line) {
                if !mdbTrim(m[2]).isEmpty { out.append(.heading(level: m[1].count, text: mdbTrim(m[2]))) }
                i += 1
            } else if mdbGroups(mdbQuote, line) != nil {
                var quoted: [String] = []
                while i < lines.count, let m = mdbGroups(mdbQuote, lines[i]) {
                    quoted.append(m[1])
                    i += 1
                }
                let text = mdbTrim(quoted.joined(separator: "\n"))
                if !text.isEmpty { out.append(.quote(text)) }
            } else if let m = mdbGroups(mdbBullet, line) {
                if !mdbTrim(m[2]).isEmpty { out.append(.bullet(depth: mdbDepth(m[1]), text: mdbTrim(m[2]))) }
                i += 1
            } else if let m = mdbGroups(mdbNumbered, line) {
                if !mdbTrim(m[3]).isEmpty { out.append(.numbered(n: Int(m[2]) ?? 1, depth: mdbDepth(m[1]), text: mdbTrim(m[3]))) }
                i += 1
            } else {
                // a paragraph: plain lines up to a blank line or a line that begins another block (a table may start right under a sentence)
                var para: [String] = [mdbTrim(line)]
                i += 1
                while i < lines.count && !mdbTrim(lines[i]).isEmpty && !mdbStartsOtherBlock(lines, i) {
                    para.append(mdbTrim(lines[i]))
                    i += 1
                }
                out.append(.paragraph(para.joined(separator: "\n")))
            }
        }
        return out
    }

    /// Whether the answer has anything beyond plain paragraphs (a heading, list, quote, code, table or rule): the phone then draws it block by
    /// block; an answer of plain paragraphs keeps the single text view it always had.
    static func hasStructure(_ blocks: [MarkdownBlock]) -> Bool {
        blocks.contains { block in
            if case .paragraph = block { return false }
            return true
        }
    }

    /// A block's text as the reader sees it, inline marks read (what VoiceOver says and what a test compares).
    static func plain(_ text: String) -> String {
        String(ContentParser.renderMarkdown(text).characters)
    }
}
