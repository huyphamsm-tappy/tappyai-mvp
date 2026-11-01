import Foundation
import CoreGraphics

// The finished Deep Research report as a PDF: the pure part (how the text is cut into blocks, how the sources and tables are read, the page's
// look and the rules that keep a heading with what follows). A port of the web's reportExport.ts (after its 01/11 fix) and of Android's
// ReportExport.kt (`PdfBlock`, `PdfStyle`, `pdfBlocks`, `reportForPdf`, ...). The drawing is in ReportPdfWriter.swift.

/// One block of the PDF: a heading (level 1-3) or body text (0), as the reader sees it - no Markdown marks; `rows` is set for a table
/// (header first).
struct PdfBlock: Equatable, Sendable {
    let level: Int
    let text: String
    let rows: [[String]]?

    init(level: Int, text: String, rows: [[String]]? = nil) {
        self.level = level
        self.text = text
        self.rows = rows
    }
}

/// The PDF's look (web 16 px / 1.75 reads at about 12 pt / 1.5 on A4): sizes and gaps in points.
enum PdfStyle {
    static let pageW: CGFloat = 595
    static let pageH: CGFloat = 842
    static let margin: CGFloat = 56
    static let title: CGFloat = 26
    static let h1: CGFloat = 22
    static let h2: CGFloat = 18
    static let h3: CGFloat = 15
    static let body: CGFloat = 12
    static let lineMultiple: CGFloat = 1.5
    static let gapBody: CGFloat = 12
    static let gapHead: CGFloat = 8
    static let gapTitle: CGFloat = 20
    static let beforeH1: CGFloat = 22
    static let beforeH2: CGFloat = 16
    static let beforeH3: CGFloat = 12
    static let footerH: CGFloat = 30
    static let cellPad: CGFloat = 6
}

/// True when a heading drawn at `y` would be left alone at the bottom of the page: it needs room for itself and two lines of what follows.
func keepHeadingWithNext(y: CGFloat, headingH: CGFloat, nextLineH: CGFloat, bottom: CGFloat) -> Bool {
    y + headingH + 2 * nextLineH > bottom
}

/// The narrowest text width, in points, that is worth a grid column.
private let minCellTextWidth: CGFloat = 24

/// True when a table of `cols` columns in `width` points leaves each cell a readable text width (else it is drawn as text).
func tableFitsGrid(cols: Int, width: CGFloat, pad: CGFloat) -> Bool {
    cols > 0 && (width / CGFloat(cols)).rounded(.down) - 2 * pad >= minCellTextWidth
}

/// True when a table row of `rowH` points fits the body of one page (`bodyH`); a taller row is drawn as text.
func rowFitsPage(rowH: CGFloat, bodyH: CGFloat) -> Bool { rowH <= bodyH }

/// The footer of a page: "n / N" (the web prints the same).
func pageLabel(_ n: Int, _ total: Int) -> String { "\(n) / \(total)" }

// MARK: - Small regex helpers (named for this file: ReportExport.swift keeps its own private ones)

private func pdfRegex(_ pattern: String) -> NSRegularExpression? { try? NSRegularExpression(pattern: pattern) }

private func pdfIsMatch(_ pattern: String, _ s: String) -> Bool {
    guard let re = pdfRegex(pattern) else { return false }
    return re.firstMatch(in: s, range: NSRange(location: 0, length: (s as NSString).length)) != nil
}

/// The groups of the first match (group 0 first; a group that did not take part is ""), or nil.
private func pdfGroups(_ pattern: String, _ s: String) -> [String]? {
    guard let re = pdfRegex(pattern) else { return nil }
    let ns = s as NSString
    guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
    return (0..<m.numberOfRanges).map { i in
        m.range(at: i).location == NSNotFound ? "" : ns.substring(with: m.range(at: i))
    }
}

private func pdfReplace(_ s: String, _ pattern: String, _ template: String) -> String {
    guard let re = pdfRegex(pattern) else { return s }
    return re.stringByReplacingMatches(in: s, range: NSRange(location: 0, length: (s as NSString).length), withTemplate: template)
}

private func pdfTrim(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

private let headingLinePattern = #"^\s{0,3}#{1,6}\s"#

// MARK: - The sources list

/// The report for the PDF: the sources list (the last section) keeps each address in view ("n. title — https://..."), because a PDF page has
/// no link to tap and the web's printed page keeps its links. A source without a safe https address stays as it was.
func reportForPdf(_ text: String, _ links: [ResearchLink]) -> String {
    let lines = reportMarkdown(text, links).components(separatedBy: "\n")
    let last = lines.lastIndex { pdfIsMatch(headingLinePattern, $0) } ?? -1
    return lines.enumerated().map { i, line in
        if i <= last { return line }
        guard let m = pdfGroups(#"^(\d{1,3})\. \[(.*)\]\((https://[^)\s]+)\)$"#, line) else { return line }
        return "\(m[1]). \(m[2]) — \(m[3])"
    }.joined(separator: "\n")
}

// MARK: - Blocks

private let tableSeparatorPattern = #"^\|?\s*:?-{2,}[\s:|-]*$"#

/// The rows of a Markdown table chunk (separator row dropped, marks stripped), or nil when the chunk is not a table.
private func pdfTableRows(_ chunk: String) -> [[String]]? {
    let lines = chunk.components(separatedBy: "\n").map { pdfTrim($0) }
    guard lines.count >= 2, lines.allSatisfy({ $0.hasPrefix("|") }), pdfIsMatch(tableSeparatorPattern, lines[1]) else { return nil }
    return lines.enumerated().filter { $0.offset != 1 }.map { entry -> [String] in
        var line = entry.element
        if line.hasPrefix("|") { line.removeFirst() }
        if line.hasSuffix("|") { line.removeLast() }
        return line.components(separatedBy: "|").map { pdfTrim(pdfVisibleKeepingAddresses(pdfTrim($0))) }
    }
}

/// A chunk written without blank lines around its heading or table: the heading line is a block of its own (it used to make the whole list
/// under it a heading), and a table starting under a sentence is a block of its own. A chunk holding a fence is left whole.
private func pdfSplitAtHeadingsAndTables(_ chunk: String) -> [String] {
    if chunk.contains("```") { return [chunk] }
    var out: [String] = []
    var buf: [String] = []
    func flush() {
        if !buf.isEmpty { out.append(buf.joined(separator: "\n")); buf.removeAll() }
    }
    var inTable = false
    for line in chunk.components(separatedBy: "\n") {
        let isHeading = pdfIsMatch(headingLinePattern, line)
        let isTableLine = line.trimmingCharacters(in: .whitespaces).hasPrefix("|")
        if isHeading || isTableLine != inTable { flush() }
        inTable = isTableLine
        buf.append(line)
        if isHeading { flush() }
    }
    flush()
    return out
}

/// The report cut into blocks at blank lines (a fenced code block stays whole), each read as the reader sees it.
func pdfBlocks(_ markdown: String) -> [PdfBlock] {
    var chunks: [String] = []
    var buf: [String] = []
    var inFence = false
    let normalised = markdown.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
    for line in normalised.components(separatedBy: "\n") {
        if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") { inFence.toggle() }
        if pdfTrim(line).isEmpty && !inFence {
            if !buf.isEmpty { chunks.append(buf.joined(separator: "\n")); buf.removeAll() }
            continue
        }
        buf.append(line)
    }
    if !buf.isEmpty { chunks.append(buf.joined(separator: "\n")) }

    return chunks.flatMap(pdfSplitAtHeadingsAndTables).compactMap { chunk -> PdfBlock? in
        if let rows = pdfTableRows(chunk) {
            return PdfBlock(level: 0, text: rows.map { $0.joined(separator: "\t") }.joined(separator: "\n"), rows: rows)
        }
        let text = pdfTrim(pdfVisibleKeepingAddresses(chunk))
        if text.isEmpty { return nil }
        var level = 0
        if let m = pdfGroups(#"^\s{0,3}(#{1,6})\s"#, chunk) { level = min(m[1].count, 3) }
        return PdfBlock(level: level, text: text)
    }
}

// MARK: - Markdown read as the reader sees it

/// The chunk as the reader sees it, except that an address standing on its own stays an address: on a screen a bare address is a link, on paper
/// it is not, so the sources would lose where they came from. A `[label](address)` in a sentence still reads as its label.
private func pdfVisibleKeepingAddresses(_ chunk: String) -> String {
    guard let re = pdfRegex(#"(?<![(])https?://[^\s)\]]+"#) else { return pdfVisibleText(chunk) }
    let ns = chunk as NSString
    var urls: [String] = []
    var masked = ""
    var at = 0
    for m in re.matches(in: chunk, range: NSRange(location: 0, length: ns.length)) {
        masked += ns.substring(with: NSRange(location: at, length: m.range.location - at))
        masked += "ZZURL\(urls.count)ZZ"
        urls.append(ns.substring(with: m.range))
        at = m.range.location + m.range.length
    }
    if urls.isEmpty { return pdfVisibleText(chunk) }
    masked += ns.substring(from: at)

    let visible = pdfVisibleText(masked)
    guard let slot = pdfRegex(#"ZZURL(\d+)ZZ"#) else { return visible }
    let vs = visible as NSString
    var out = ""
    var from = 0
    for m in slot.matches(in: visible, range: NSRange(location: 0, length: vs.length)) {
        out += vs.substring(with: NSRange(location: from, length: m.range.location - from))
        let index = Int(vs.substring(with: m.range(at: 1))) ?? -1
        out += urls.indices.contains(index) ? urls[index] : ""
        from = m.range.location + m.range.length
    }
    out += vs.substring(from: from)
    return out
}

/// Markdown as plain lines: heading marks gone, bullets as "•", numbers kept, a link as its label, bold / italic / code marks gone (an
/// underscore or a lone star inside a word stays), a code fence's lines as they are. Bold is balanced per line first, as the chat does.
private func pdfVisibleText(_ markdown: String) -> String {
    var out: [String] = []
    var inFence = false
    for raw in MarkdownNormalize.balanceBoldPerLine(markdown).components(separatedBy: "\n") {
        let t = raw.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("```") { inFence.toggle(); continue }
        if inFence { out.append(raw); continue }
        if t.isEmpty { continue }
        if pdfIsMatch(#"^([-*_])\1{2,}$"#, t) {
            out.append("—")
        } else if let m = pdfGroups(#"^#{1,6}\s+(.*)$"#, t) {
            out.append(pdfInline(m[1]))
        } else if let m = pdfGroups(#"^[-*+•]\s+(.*)$"#, t) {
            out.append("• " + pdfInline(m[1]))
        } else if let m = pdfGroups(#"^(\d{1,3})[.)]\s+(.*)$"#, t) {
            out.append("\(m[1]). " + pdfInline(m[2]))
        } else if let m = pdfGroups(#"^>\s?(.*)$"#, t) {
            out.append(pdfInline(m[1]))
        } else {
            out.append(pdfInline(t))
        }
    }
    return out.joined(separator: "\n")
}

private func pdfInline(_ s: String) -> String {
    var t = s
    // a link (or image) is its label; an address may hold one level of brackets
    t = pdfReplace(t, #"!?\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)"#, "$1")
    t = pdfReplace(t, #"\*\*([^*]+)\*\*"#, "$1")
    t = pdfReplace(t, #"\*{2,}"#, "")
    t = pdfReplace(t, #"`([^`\n]+)`"#, "$1")
    t = pdfReplace(t, #"(?<![\p{L}\p{N}*])\*(?=[^\s*])([^*\n]*[^\s*])\*(?![\p{L}\p{N}*])"#, "$1")
    t = pdfReplace(t, #"(?<![\p{L}\p{N}_])_(?=[^\s_])([^_\n]*[^\s_])_(?![\p{L}\p{N}_])"#, "$1")
    return t
}
