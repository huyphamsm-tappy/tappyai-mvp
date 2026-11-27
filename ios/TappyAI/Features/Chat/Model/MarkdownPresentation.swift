import Foundation

// Layout step 2 (owner spec 26/11, §B «vẽ»): how the blocks of an answer are PRESENTED, decided from the text's own structure only (never from the
// question's subject). Pure, so each rule is tested without a view. The parser (`MarkdownBlocks`) is unchanged.

/// What the view draws: a block as it is, or a data box (a table with the short line above it as its title and the short line under it as its caption).
enum PresentedBlock: Equatable, Sendable {
    case block(MarkdownBlock)
    case dataBox(title: String?, rows: [[String]], caption: String?)
}

enum MarkdownPresentation {
    /// The longest line that can be a data box's title (ends with «:») or caption.
    static let maxTitleLength = 90
    static let maxCaptionLength = 160

    /// The blocks in drawing order: unnumbered level-2 headings are numbered «1. 2. …» when the answer has at least two of them (as web does),
    /// and a table takes its title and caption from the short lines beside it.
    static func items(_ blocks: [MarkdownBlock]) -> [PresentedBlock] {
        let numbered = numberHeadings(blocks)
        var out: [PresentedBlock] = []
        var i = 0
        while i < numbered.count {
            let block = numbered[i]
            if case .table(let rows) = block {
                // The title is the short single line just above the table, ending with «:»; it is taken out of the paragraph before it.
                var title: String?
                if let last = out.last, case .block(.paragraph(let text)) = last, let t = titleLine(text) {
                    title = t
                    out.removeLast()
                    if let rest = remainderBeforeTitle(text, title: t) { out.append(.block(.paragraph(rest))) }
                }
                // The caption is the short single line just below the table.
                var caption: String?
                if i + 1 < numbered.count, case .paragraph(let text) = numbered[i + 1], let c = captionLine(text) {
                    caption = c
                    i += 1
                }
                out.append(.dataBox(title: title, rows: rows, caption: caption))
            } else {
                out.append(.block(block))
            }
            i += 1
        }
        return out
    }

    /// Numbers the unnumbered level-2 headings «1. Tiêu đề» when there are at least two of them; a heading the model numbered keeps its number.
    static func numberHeadings(_ blocks: [MarkdownBlock]) -> [MarkdownBlock] {
        let level2 = blocks.filter { if case .heading(2, _) = $0 { return true } else { return false } }.count
        guard level2 >= 2 else { return blocks }
        var n = 0
        return blocks.map { block in
            guard case .heading(2, let text) = block else { return block }
            n += 1
            if startsWithNumber(text) { return block }
            return .heading(level: 2, text: "\(n). \(text)")
        }
    }

    private static func startsWithNumber(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespaces)
        guard let first = t.first else { return false }
        return first.isNumber
    }

    /// A single short line that ends with «:» (the title of a table), or nil.
    static func titleLine(_ text: String) -> String? {
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
        guard let last = lines.last, last.hasSuffix(":"), last.count <= maxTitleLength else { return nil }
        let title = String(last.dropLast()).trimmingCharacters(in: .whitespaces)
        return title.isEmpty ? nil : title
    }

    /// The paragraph's own lines without its last one (the title that became the box's title), or nil when nothing is left.
    static func remainderBeforeTitle(_ text: String, title: String) -> String? {
        var lines = text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        lines.removeLast()
        let rest = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return rest.isEmpty ? nil : rest
    }

    /// A single short line (no line break, at most 160 characters) that can be a caption, or nil.
    static func captionLine(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !t.contains("\n"), t.count <= maxCaptionLength else { return nil }
        return t
    }
}
