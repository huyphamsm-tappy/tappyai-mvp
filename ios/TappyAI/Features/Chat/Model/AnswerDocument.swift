import Foundation

/// The one entry point for drawing an answer's text (layout step 2, spec §A «bộ phân tích khối»). The parser is `MarkdownBlocks.parse` (unchanged,
/// its tests still pass) and the presentation rules are `MarkdownPresentation`. Before parsing, `repaired` mends the one kind of glued text the
/// model writes that the parser cannot read: a heading marker stuck to the end of a sentence («…nhé.## Mục»). Code blocks are never touched.
enum AnswerDocument {
    /// The drawing order of an answer's Markdown: blocks, with data boxes and numbered headings decided from the text's own structure.
    static func items(_ markdown: String) -> [PresentedBlock] {
        MarkdownPresentation.items(MarkdownBlocks.parse(repaired(markdown)))
    }

    /// Breaks a heading marker that sits right after a sentence end, on the same line («Đoạn đầu.## Tiêu đề» → two lines). A `#` that is part of
    /// a word («C# », «#hashtag») is not a heading and is left alone: only `##`…`######` followed by a space count.
    static func repaired(_ markdown: String) -> String {
        var inFence = false
        let lines = markdown.components(separatedBy: "\n").map { line -> String in
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("```") { inFence.toggle(); return line }
            if inFence { return line }
            return breakGluedHeadings(line)
        }
        return lines.joined(separator: "\n")
    }

    private static let gluedHeading = try! NSRegularExpression(pattern: "(?<=[.!?:])[ \\t]*(?=#{2,6} \\S)")

    private static func breakGluedHeadings(_ line: String) -> String {
        let range = NSRange(line.startIndex..., in: line)
        guard gluedHeading.firstMatch(in: line, range: range) != nil else { return line }
        // Each match is replaced by a line break; the replacement has no template, so no escaping is needed.
        return gluedHeading.stringByReplacingMatches(in: line, range: range, withTemplate: "\n")
    }
}
