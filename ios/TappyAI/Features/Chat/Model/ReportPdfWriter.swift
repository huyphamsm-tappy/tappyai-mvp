import UIKit

// The finished Deep Research report drawn as an A4 PDF (port of Android's PdfWriter in ReportExport.kt). Two passes over the same layout code:
// the first only counts the pages (the footer needs "n / N"), the second draws them. Text is laid out with TextKit (NSLayoutManager) so a block
// can be cut between lines at a page break; a heading is kept with the lines after it; a table is a grid whose rows are never split, and a table
// that cannot be a grid (too many columns, a row taller than a page) flows as text. Nothing is drawn outside the margins except the footer.

/// A block of text laid out in a width: its lines (top and bottom in points, the glyph range of each), and how to draw some of them.
private final class PdfTextBlock {
    struct Line {
        let top: CGFloat
        let bottom: CGFloat
        let glyphs: NSRange
    }

    private let storage: NSTextStorage
    private let manager = NSLayoutManager()
    private let container: NSTextContainer
    private(set) var lines: [Line] = []

    var height: CGFloat { lines.last?.bottom ?? 0 }

    init(text: String, font: UIFont, color: UIColor, width: CGFloat) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineHeightMultiple = PdfStyle.lineMultiple
        paragraph.lineBreakMode = .byWordWrapping
        storage = NSTextStorage(string: text, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: paragraph])
        container = NSTextContainer(size: CGSize(width: max(width, 1), height: CGFloat.greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        manager.addTextContainer(container)
        storage.addLayoutManager(manager)
        manager.ensureLayout(for: container)
        var found: [Line] = []
        manager.enumerateLineFragments(forGlyphRange: manager.glyphRange(for: container)) { rect, _, _, glyphs, _ in
            found.append(Line(top: rect.minY, bottom: rect.maxY, glyphs: glyphs))
        }
        lines = found
    }

    /// Draws lines `first...last` with the top of line `first` at `origin`, clipped to `clipWidth` and to those lines.
    func draw(first: Int, last: Int, at origin: CGPoint, clipWidth: CGFloat, in cg: CGContext) {
        let top = lines[first].top
        let bottom = lines[last].bottom
        let start = lines[first].glyphs.location
        let range = NSRange(location: start, length: NSMaxRange(lines[last].glyphs) - start)
        cg.saveGState()
        cg.clip(to: CGRect(x: origin.x, y: origin.y, width: clipWidth, height: bottom - top))
        let layoutOrigin = CGPoint(x: origin.x, y: origin.y - top)
        manager.drawBackground(forGlyphRange: range, at: layoutOrigin)
        manager.drawGlyphs(forGlyphRange: range, at: layoutOrigin)
        cg.restoreGState()
    }
}

private func pdfFont(_ size: CGFloat, bold: Bool) -> UIFont {
    UIFont.systemFont(ofSize: size, weight: bold ? .bold : .regular)
}

/// Lays the report out on A4 pages. With no context it only counts the pages; with one it draws them.
private final class PdfPageWriter {
    private let context: UIGraphicsPDFRendererContext?
    private let total: Int
    private let width: CGFloat
    private let bottom: CGFloat
    private let bodyLineH: CGFloat
    private var y: CGFloat = PdfStyle.margin
    private var pageOpen = false
    private(set) var pages = 0

    init(context: UIGraphicsPDFRendererContext?, total: Int) {
        self.context = context
        self.total = total
        let w = PdfStyle.pageW - 2 * PdfStyle.margin
        self.width = w
        self.bottom = PdfStyle.pageH - PdfStyle.margin - PdfStyle.footerH
        self.bodyLineH = PdfTextBlock(text: "Ag", font: pdfFont(PdfStyle.body, bold: false), color: .black, width: w).height
    }

    private func newPage() {
        finishPage()
        pages += 1
        context?.beginPage()
        pageOpen = true
        y = PdfStyle.margin
    }

    private func finishPage() {
        guard pageOpen else { return }
        pageOpen = false
        guard context != nil else { return }
        let label = pageLabel(pages, total)
        let attributes: [NSAttributedString.Key: Any] = [.font: pdfFont(10, bold: false), .foregroundColor: UIColor(white: 0.4, alpha: 1)]
        let size = (label as NSString).size(withAttributes: attributes)
        (label as NSString).draw(at: CGPoint(x: (PdfStyle.pageW - size.width) / 2, y: PdfStyle.pageH - PdfStyle.margin - 4), withAttributes: attributes)
    }

    func finish() { finishPage() }

    /// A block of text, drawn line by line so it can run over a page break; a heading (`keepNext`) never ends a page alone.
    private func text(_ text: String, font: UIFont, gapAfter: CGFloat, before: CGFloat = 0, keepNext: Bool = false) {
        if pages == 0 { newPage() }
        let block = PdfTextBlock(text: text, font: font, color: .black, width: width)
        if before > 0 && y > PdfStyle.margin { y += before }
        if keepNext && y > PdfStyle.margin && keepHeadingWithNext(y: y, headingH: block.height, nextLineH: bodyLineH, bottom: bottom) { newPage() }
        let lines = block.lines
        var line = 0
        while line < lines.count {
            if y + (lines[line].bottom - lines[line].top) > bottom && y > PdfStyle.margin { newPage() }
            var last = line
            while last + 1 < lines.count && y + (lines[last + 1].bottom - lines[line].top) <= bottom { last += 1 }
            if let cg = context?.cgContext {
                block.draw(first: line, last: last, at: CGPoint(x: PdfStyle.margin, y: y), clipWidth: width, in: cg)
            }
            y += lines[last].bottom - lines[line].top
            line = last + 1
        }
        y += gapAfter
    }

    /// A table as a grid: equal columns, a filled bold header row, a thin border round every cell, a row never split over a page.
    private func table(_ rows: [[String]]) {
        if pages == 0 { newPage() }
        let cols = rows.map { $0.count }.max() ?? 0
        let pad = PdfStyle.cellPad
        // so many columns that a cell has no width: the rows flow as text, cells joined by " | "
        if !tableFitsGrid(cols: cols, width: width, pad: pad) {
            for (r, cells) in rows.enumerated() {
                text(cells.joined(separator: " | "), font: pdfFont(PdfStyle.body - 1, bold: r == 0), gapAfter: 4)
            }
            y += PdfStyle.gapBody
            return
        }
        let colW = (width / CGFloat(cols)).rounded(.down)
        for (r, cells) in rows.enumerated() {
            let font = pdfFont(PdfStyle.body - 1, bold: r == 0)
            let blocks = (0..<cols).map { c in
                PdfTextBlock(text: c < cells.count ? cells[c] : "", font: font, color: .black, width: colW - 2 * pad)
            }
            let rowH = (blocks.map { $0.height }.max() ?? 0) + 2 * pad
            // a row taller than a whole page cannot be a grid row (it would run off the bottom over the footer): its cells flow as text
            if !rowFitsPage(rowH: rowH, bodyH: bottom - PdfStyle.margin) {
                for cell in cells where !pdfIsBlank(cell) { text(cell, font: font, gapAfter: 4) }
                continue
            }
            if y + rowH > bottom && y > PdfStyle.margin { newPage() }
            if let cg = context?.cgContext {
                cg.setLineWidth(0.7)
                for c in 0..<cols {
                    let x = PdfStyle.margin + CGFloat(c) * colW
                    let rect = CGRect(x: x, y: y, width: colW, height: rowH)
                    if r == 0 {
                        cg.setFillColor(UIColor(red: 0xEE / 255, green: 0xF2 / 255, blue: 0xFA / 255, alpha: 1).cgColor)
                        cg.fill(rect)
                    }
                    cg.setStrokeColor(UIColor(white: 0xBB / 255, alpha: 1).cgColor)
                    cg.stroke(rect)
                    let cell = blocks[c]
                    if !cell.lines.isEmpty {
                        cell.draw(first: 0, last: cell.lines.count - 1, at: CGPoint(x: x + pad, y: y + pad), clipWidth: colW - 2 * pad, in: cg)
                    }
                }
            }
            y += rowH
        }
        y += PdfStyle.gapBody
    }

    func render(title: String, blocks: [PdfBlock]) {
        if pages == 0 { newPage() }
        if !pdfIsBlank(title) { text(title, font: pdfFont(PdfStyle.title, bold: true), gapAfter: PdfStyle.gapTitle) }
        for b in blocks {
            if let rows = b.rows, !rows.isEmpty {
                table(rows)
            } else if b.level == 1 && b.text.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(title.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame {
                // the report's own "# " title is the document title already drawn above
                continue
            } else if b.level == 1 {
                text(b.text, font: pdfFont(PdfStyle.h1, bold: true), gapAfter: PdfStyle.gapHead, before: PdfStyle.beforeH1, keepNext: true)
            } else if b.level == 2 {
                text(b.text, font: pdfFont(PdfStyle.h2, bold: true), gapAfter: PdfStyle.gapHead, before: PdfStyle.beforeH2, keepNext: true)
            } else if b.level == 3 {
                text(b.text, font: pdfFont(PdfStyle.h3, bold: true), gapAfter: PdfStyle.gapHead, before: PdfStyle.beforeH3, keepNext: true)
            } else {
                text(b.text, font: pdfFont(PdfStyle.body, bold: false), gapAfter: PdfStyle.gapBody)
            }
        }
    }
}

private func pdfIsBlank(_ s: String) -> Bool { s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

/// How many A4 pages the report takes (the first pass: the footer of each page says "n / N").
func pdfPageCount(title: String, blocks: [PdfBlock]) -> Int {
    let counter = PdfPageWriter(context: nil, total: 0)
    counter.render(title: title, blocks: blocks)
    return counter.pages
}

/// The report as an A4 PDF: the title, then each block, pages as needed, "n / N" at the foot. Built in memory; the caller saves it.
func writeReportPdf(title: String, blocks: [PdfBlock]) -> Data {
    let total = pdfPageCount(title: title, blocks: blocks)
    let format = UIGraphicsPDFRendererFormat()
    format.documentInfo = [kCGPDFContextTitle as String: title, kCGPDFContextCreator as String: "TappyAI"]
    let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: PdfStyle.pageW, height: PdfStyle.pageH), format: format)
    return renderer.pdfData { ctx in
        let writer = PdfPageWriter(context: ctx, total: total)
        writer.render(title: title, blocks: blocks)
        writer.finish()
    }
}
