import Foundation

// A4 (02/11): the answer's pictures and charts placed UNDER THEIR SECTIONS - a port of Android's `placeArticle` (ArticleLayout.kt) and of the web's article
// layout (src/lib/answerDoc/parse.ts `headingTitle` / `listItemTitle`, src/components/chat/ArticleAnswer.tsx `assignPictures`). The server chose and checked
// every picture and figure; the phone only finds the heading (or the bold-lead list item) each one names, through `answerTitleKey` / `answerCleanTitle`
// (ReportExport.swift). Pure functions: no UI, no state.

/// One piece of a laid-out answer, in reading order.
enum ArticlePart: Equatable, Sendable {
    /// Markdown blocks to draw one after another.
    case blocks([MarkdownBlock])
    /// A report chart, right under the section it names.
    case chart(ResearchChart)
    /// A section / item picture (`tappy.doc_media.v1`), right under the heading or list item whose title it carries.
    case picture(DocMediaItem)
    /// A run of pictures the model wrote into the text itself, exactly where it wrote them.
    case images([ParsedImage])
}

enum ArticleLayout {

    private static let leadBold = #"^\s*(?:\d{1,3}[.)]\s*)?\*\*(.+?)\*\*"#

    private static func okTitle(_ t: String) -> Bool {
        t.count >= 2 && t.count <= 60 && t.split(whereSeparator: { $0.isWhitespace }).count <= 8
    }

    /// The words a heading names a section with, or nil when they are not a title (too long, too short).
    static func headingTitle(_ text: String) -> String? {
        let t = answerCleanTitle(text)
        return okTitle(t) ? t : nil
    }

    /// The bold lead of a list item ("**Hội An** - phố cổ ..."), cleaned, or nil when the item does not start with one.
    static func listItemTitle(_ text: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: leadBold) else { return nil }
        let ns = text as NSString
        guard let m = re.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)), m.numberOfRanges > 1,
              m.range(at: 1).location != NSNotFound else { return nil }
        let t = answerCleanTitle(ns.substring(with: m.range(at: 1)))
        return okTitle(t) ? t : nil
    }

    /// The title a block carries (a heading's words, a list item's bold lead), or nil for any other block.
    static func title(of block: MarkdownBlock) -> String? {
        switch block {
        case .heading(_, let text): return headingTitle(text)
        case .bullet(_, let text): return listItemTitle(text)
        case .numbered(_, _, let text): return listItemTitle(text)
        case .paragraph, .quote, .code, .table, .rule: return nil
        }
    }

    /// What is still to be placed: each chart goes once, to the first section named like it; each picture once, to the first title named like it.
    private struct Placer {
        var charts: [ResearchChart?]
        var pictures: [DocMediaItem?]

        /// A chart wins its section, so a picture whose title a chart already carries is not shown (web: the server drops it).
        init(media: [DocMediaItem], charts: [ResearchChart]) {
            self.charts = charts.map { Optional($0) }
            let charted = Set(charts.map { answerTitleKey($0.section) }.filter { !$0.isEmpty })
            self.pictures = media.filter { !charted.contains(answerTitleKey($0.title)) }.map { Optional($0) }
        }

        var isEmpty: Bool { !charts.contains { $0 != nil } && !pictures.contains { $0 != nil } }

        mutating func take(_ title: String) -> ArticlePart? {
            let key = answerTitleKey(title)
            if key.isEmpty { return nil }
            if let i = charts.firstIndex(where: { entry in entry.map { answerTitleKey($0.section) == key } ?? false }), let chart = charts[i] {
                charts[i] = nil
                return .chart(chart)
            }
            if let i = pictures.firstIndex(where: { entry in entry.map { answerTitleKey($0.title) == key } ?? false }), let picture = pictures[i] {
                pictures[i] = nil
                return .picture(picture)
            }
            return nil
        }

        /// The leftovers, charts first: a chart or picture whose title is nowhere in the text is shown after it, never lost.
        func rest() -> [ArticlePart] {
            charts.compactMap { $0 }.map { ArticlePart.chart($0) } + pictures.compactMap { $0 }.map { ArticlePart.picture($0) }
        }
    }

    /// The reply laid out: its text pieces cut at the headings and bold-lead list items that have a chart or a picture, each placed right after
    /// its block; pictures written in the text stay where they are; what matched nothing comes last.
    static func place(segments: [ReplySegment], media: [DocMediaItem], charts: [ResearchChart]) -> [ArticlePart] {
        var placer = Placer(media: media, charts: charts)
        var out: [ArticlePart] = []
        for segment in segments {
            switch segment {
            case .images(let images):
                if !images.isEmpty { out.append(.images(images)) }
            case .text(let text):
                let blocks = MarkdownBlocks.parse(text)
                if placer.isEmpty {
                    if !blocks.isEmpty { out.append(.blocks(blocks)) }
                    continue
                }
                var buffer: [MarkdownBlock] = []
                for block in blocks {
                    buffer.append(block)
                    guard let sectionTitle = ArticleLayout.title(of: block), let placed = placer.take(sectionTitle) else { continue }
                    out.append(.blocks(buffer))
                    buffer = []
                    out.append(placed)
                }
                if !buffer.isEmpty { out.append(.blocks(buffer)) }
            }
        }
        return out + placer.rest()
    }

    /// Whether the reply needs the laid-out drawing: it has structure the single text view cannot show (heading, list, table, ...), or a chart /
    /// section picture to place, or a picture written in the middle of its text. A reply of plain paragraphs, with its pictures (if any) at the
    /// end, keeps the old drawing.
    static func needsLayout(segments: [ReplySegment], media: [DocMediaItem], charts: [ResearchChart]) -> Bool {
        if !media.isEmpty || !charts.isEmpty { return true }
        for (index, segment) in segments.enumerated() {
            switch segment {
            case .text(let text):
                if MarkdownBlocks.hasStructure(MarkdownBlocks.parse(text)) { return true }
            case .images:
                if index < segments.count - 1 { return true }
            }
        }
        return false
    }
}
