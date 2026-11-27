import UIKit

/// The trip plan as a DESIGNED PDF (owner UAT 27/11: «file pdf down về ko có hình ảnh gì cả, cần coi lại nội dung và bố cục»). The old file was the
/// plan's text run through the report writer: bullets only. This draws a header band with the title and the plan's own facts, one block per day
/// with a photo beside every stop that has one (its own `photo_url`, else the picture the server found for it), the stays, the dishes, the budget
/// as a table with the plan's own total, and the tips, on A4 with page numbers. Only what the plan states is written; a stop with no picture
/// simply has no picture. Built on the phone; nothing is sent anywhere.
enum TripPdfRenderer {
    private static let page = CGRect(x: 0, y: 0, width: 595, height: 842)
    private static let margin: CGFloat = 40
    private static let bottom: CGFloat = 842 - 46
    private static let contentWidth: CGFloat = 595 - 80

    private static let ink = UIColor(red: 0.07, green: 0.10, blue: 0.17, alpha: 1)
    private static let grey = UIColor(red: 0.38, green: 0.43, blue: 0.51, alpha: 1)
    private static let blue = UIColor(red: 0.0, green: 0.48, blue: 1.0, alpha: 1)
    private static let band = UIColor(red: 0.05, green: 0.09, blue: 0.18, alpha: 1)
    private static let tint = UIColor(red: 0.92, green: 0.95, blue: 1.0, alpha: 1)
    private static let line = UIColor(red: 0.86, green: 0.88, blue: 0.92, alpha: 1)

    /// The words of the file that are not the plan's own.
    struct Words {
        var brand = "TappyAI"
        var stays: String
        var dishes: String
        var budget: String
        var item: String
        var cost: String
        var total: String
        var tips: String
    }

    /// `images` are the pictures already downloaded and scaled, by the same key `PlanPdf.pictureKey` gives a stop.
    static func render(plan: TappyPlan, facts: String, words: Words, images: [String: UIImage]) -> Data {
        // Two passes: the first only counts the pages (so every page can say «n / total»), the second draws.
        var total = 1
        for pass in 0..<2 {
            var data = Data()
            let w = Writer(counting: pass == 0, total: total)
            if pass == 1 {
                let renderer = UIGraphicsPDFRenderer(bounds: page, format: pdfFormat(title: plan.title))
                data = renderer.pdfData { ctx in
                    w.context = ctx
                    draw(plan: plan, facts: facts, words: words, images: images, writer: w)
                    w.finishPage()
                }
                return data
            }
            draw(plan: plan, facts: facts, words: words, images: images, writer: w)
            w.finishPage()
            total = max(1, w.pageNumber)
        }
        return Data()
    }

    private static func pdfFormat(title: String) -> UIGraphicsPDFRendererFormat {
        let f = UIGraphicsPDFRendererFormat()
        f.documentInfo = [kCGPDFContextTitle as String: title, kCGPDFContextCreator as String: "TappyAI"]
        return f
    }

    // MARK: - Writer (pages and the cursor)

    private final class Writer {
        let counting: Bool
        let total: Int
        var context: UIGraphicsPDFRendererContext?
        var pageNumber = 0
        var y: CGFloat = 0

        init(counting: Bool, total: Int) { self.counting = counting; self.total = total }

        func newPage(running title: String?) {
            finishPage()
            pageNumber += 1
            if !counting { context?.beginPage() }
            y = margin
            if let title, pageNumber > 1 {
                text(title, font: .systemFont(ofSize: 9, weight: .medium), color: grey, x: margin, width: contentWidth, maxLines: 1)
                y += 6
            }
        }

        func finishPage() {
            guard pageNumber > 0, !counting else { return }
            let label = "TappyAI · \(pageNumber) / \(total)" as NSString
            let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 9), .foregroundColor: grey]
            let size = label.size(withAttributes: attrs)
            label.draw(at: CGPoint(x: page.width - margin - size.width, y: page.height - 30), withAttributes: attrs)
        }

        /// Makes room for a block `height` high; a new page when it does not fit.
        func ensure(_ height: CGFloat, running title: String?) {
            if pageNumber == 0 || y + height > bottom { newPage(running: title) }
        }

        @discardableResult
        func text(_ s: String, font: UIFont, color: UIColor, x: CGFloat, width: CGFloat, maxLines: Int = 0, gapAfter: CGFloat = 0) -> CGFloat {
            let h = measure(s, font: font, width: width, maxLines: maxLines)
            if !counting, !s.isEmpty {
                let para = NSMutableParagraphStyle()
                para.lineBreakMode = .byTruncatingTail
                let rect = CGRect(x: x, y: y, width: width, height: h)
                (s as NSString).draw(with: rect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                                     attributes: [.font: font, .foregroundColor: color, .paragraphStyle: para], context: nil)
            }
            y += h + gapAfter
            return h
        }
    }

    private static func measure(_ s: String, font: UIFont, width: CGFloat, maxLines: Int = 0) -> CGFloat {
        guard !s.isEmpty else { return 0 }
        let rect = (s as NSString).boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude),
                                                options: [.usesLineFragmentOrigin], attributes: [.font: font], context: nil)
        let natural = ceil(rect.height)
        guard maxLines > 0 else { return natural }
        return min(natural, ceil(font.lineHeight) * CGFloat(maxLines))
    }

    private static func fill(_ w: Writer, _ rect: CGRect, _ color: UIColor, radius: CGFloat) {
        guard !w.counting else { return }
        color.setFill()
        UIBezierPath(roundedRect: rect, cornerRadius: radius).fill()
    }

    // MARK: - The document

    private static func draw(plan: TappyPlan, facts: String, words: Words, images: [String: UIImage], writer w: Writer) {
        let running = plan.title.isEmpty ? nil : plan.title
        w.newPage(running: nil)

        // Header band: brand, the plan's title, its facts.
        let titleFont = UIFont.systemFont(ofSize: 24, weight: .bold)
        let titleH = measure(plan.title, font: titleFont, width: contentWidth - 32, maxLines: 3)
        let factsH = measure(facts, font: .systemFont(ofSize: 12), width: contentWidth - 32, maxLines: 2)
        let bandH = 22 + 14 + titleH + 8 + factsH + 22
        fill(w, CGRect(x: margin, y: w.y, width: contentWidth, height: bandH), band, radius: 16)
        let top = w.y
        w.y = top + 18
        w.text(words.brand, font: .systemFont(ofSize: 11, weight: .bold), color: UIColor(red: 0, green: 0.83, blue: 1, alpha: 1), x: margin + 16, width: contentWidth - 32, gapAfter: 8)
        w.text(plan.title, font: titleFont, color: .white, x: margin + 16, width: contentWidth - 32, maxLines: 3, gapAfter: 8)
        w.text(facts, font: .systemFont(ofSize: 12), color: UIColor.white.withAlphaComponent(0.75), x: margin + 16, width: contentWidth - 32, maxLines: 2)
        w.y = top + bandH + 18

        for day in plan.days {
            // The day's bar stays with its first stop.
            let firstH = day.items.first.map { rowHeight($0, hasPicture: picture(for: $0, images) != nil) } ?? 0
            w.ensure(34 + firstH, running: running)
            fill(w, CGRect(x: margin, y: w.y, width: contentWidth, height: 26), tint, radius: 8)
            let label = day.label.isEmpty ? "—" : day.label
            let save = w.y
            w.y += 6
            w.text(label, font: .systemFont(ofSize: 13, weight: .bold), color: ink, x: margin + 12, width: contentWidth - 24, maxLines: 1)
            w.y = save + 26 + 8
            for item in day.items { drawRow(item, picture: picture(for: item, images), writer: w, running: running) }
            w.y += 6
        }

        section(words.stays, rows: (plan.stays ?? []).compactMap { s in
            let name = PlanMarkdown.clean(s.name); guard !name.isEmpty else { return nil }
            return (name, [s.why, s.price, s.address].map(PlanMarkdown.clean).filter { !$0.isEmpty }.joined(separator: " · "))
        }, writer: w, running: running)
        section(words.dishes, rows: (plan.dishes ?? []).compactMap { d in
            let dish = PlanMarkdown.clean(d.dish); guard !dish.isEmpty else { return nil }
            return (dish, [d.venue, d.address, d.price, d.note].map(PlanMarkdown.clean).filter { !$0.isEmpty }.joined(separator: " · "))
        }, writer: w, running: running)

        // Budget: the plan's own lines and its own total.
        let costRows = (plan.costBreakdown ?? []).map { (PlanMarkdown.clean($0.key), PlanMarkdown.clean($0.value)) }.filter { !$0.0.isEmpty && !$0.1.isEmpty }
        if !costRows.isEmpty || plan.budgetTotal != nil {
            w.ensure(80, running: running)
            heading(words.budget, writer: w)
            for (k, v) in costRows { budgetRow(k, v, bold: false, writer: w, running: running) }
            if let total = plan.budgetTotal.map(PlanMarkdown.clean), !total.isEmpty { budgetRow(words.total, total, bold: true, writer: w, running: running) }
            w.y += 10
        }

        let tips = (plan.localTips ?? []).map { PlanMarkdown.clean($0.text) }.filter { !$0.isEmpty }
        if !tips.isEmpty {
            w.ensure(60, running: running)
            heading(words.tips, writer: w)
            for tip in tips {
                let h = measure(tip, font: .systemFont(ofSize: 10.5), width: contentWidth - 26)
                w.ensure(h + 10, running: running)
                fill(w, CGRect(x: margin, y: w.y + 3, width: 5, height: 5), blue, radius: 2.5)
                w.text(tip, font: .systemFont(ofSize: 10.5), color: ink, x: margin + 14, width: contentWidth - 26, gapAfter: 6)
            }
        }
    }

    private static func picture(for item: TappyPlan.PlanItem, _ images: [String: UIImage]) -> UIImage? {
        images[PlanPdf.pictureKey(for: item)]
    }

    private static let photo: CGFloat = 58

    private static func rowHeight(_ item: TappyPlan.PlanItem, hasPicture: Bool) -> CGFloat {
        let textX: CGFloat = 52 + (hasPicture ? photo + 10 : 0)
        let width = contentWidth - textX
        var h = measure(PlanMarkdown.clean(item.name), font: .systemFont(ofSize: 12, weight: .semibold), width: width, maxLines: 2)
        h += measure(PlanMarkdown.clean(item.description), font: .systemFont(ofSize: 10.5), width: width, maxLines: 4) + 3
        h += measure(PlanMarkdown.clean(item.address), font: .systemFont(ofSize: 9), width: width, maxLines: 2) + 2
        if let price = item.price, !PlanMarkdown.clean(price).isEmpty { h += 14 }
        return max(h + 12, hasPicture ? photo + 12 : 0)
    }

    private static func drawRow(_ item: TappyPlan.PlanItem, picture: UIImage?, writer w: Writer, running: String?) {
        let hasPicture = picture != nil
        let h = rowHeight(item, hasPicture: hasPicture)
        w.ensure(h, running: running)
        let top = w.y
        let textX = margin + 52 + (hasPicture ? photo + 10 : 0)
        let width = contentWidth - 52 - (hasPicture ? photo + 10 : 0)
        let time = PlanMarkdown.clean(item.time)
        if !time.isEmpty {
            w.text(time, font: .monospacedDigitSystemFont(ofSize: 10, weight: .bold), color: blue, x: margin, width: 46, maxLines: 1)
            w.y = top
        }
        if let picture, !w.counting {
            let rect = CGRect(x: margin + 52, y: top, width: photo, height: photo)
            let path = UIBezierPath(roundedRect: rect, cornerRadius: 8)
            w.context?.cgContext.saveGState()
            path.addClip()
            // aspect-fill into the square
            let scale = max(photo / picture.size.width, photo / picture.size.height)
            let size = CGSize(width: picture.size.width * scale, height: picture.size.height * scale)
            picture.draw(in: CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2, width: size.width, height: size.height))
            w.context?.cgContext.restoreGState()
        }
        w.y = top
        w.text(PlanMarkdown.clean(item.name), font: .systemFont(ofSize: 12, weight: .semibold), color: ink, x: textX, width: width, maxLines: 2, gapAfter: 2)
        let desc = PlanMarkdown.clean(item.description)
        if !desc.isEmpty { w.text(desc, font: .systemFont(ofSize: 10.5), color: ink.withAlphaComponent(0.85), x: textX, width: width, maxLines: 4, gapAfter: 3) }
        let address = PlanMarkdown.clean(item.address)
        if !address.isEmpty { w.text(address, font: .systemFont(ofSize: 9), color: grey, x: textX, width: width, maxLines: 2, gapAfter: 2) }
        if let price = item.price.map(PlanMarkdown.clean), !price.isEmpty {
            w.text(price, font: .systemFont(ofSize: 10, weight: .bold), color: blue, x: textX, width: width, maxLines: 1)
        }
        w.y = top + h
        if !w.counting {
            line.setStroke()
            let path = UIBezierPath(); path.move(to: CGPoint(x: margin + 52, y: w.y - 5)); path.addLine(to: CGPoint(x: margin + contentWidth, y: w.y - 5))
            path.lineWidth = 0.5; path.stroke()
        }
    }

    private static func heading(_ s: String, writer w: Writer) {
        w.text(s, font: .systemFont(ofSize: 14, weight: .bold), color: ink, x: margin, width: contentWidth, maxLines: 1, gapAfter: 8)
    }

    private static func section(_ title: String, rows: [(String, String)], writer w: Writer, running: String?) {
        guard !rows.isEmpty else { return }
        w.ensure(70, running: running)
        heading(title, writer: w)
        for (name, detail) in rows {
            let h = measure(name, font: .systemFont(ofSize: 11.5, weight: .semibold), width: contentWidth - 20, maxLines: 2)
                + measure(detail, font: .systemFont(ofSize: 10), width: contentWidth - 20, maxLines: 3) + 14
            w.ensure(h, running: running)
            let top = w.y
            fill(w, CGRect(x: margin, y: top, width: contentWidth, height: h - 4), tint.withAlphaComponent(0.6), radius: 8)
            w.y = top + 6
            w.text(name, font: .systemFont(ofSize: 11.5, weight: .semibold), color: ink, x: margin + 10, width: contentWidth - 20, maxLines: 2, gapAfter: 2)
            if !detail.isEmpty { w.text(detail, font: .systemFont(ofSize: 10), color: grey, x: margin + 10, width: contentWidth - 20, maxLines: 3) }
            w.y = top + h
        }
        w.y += 6
    }

    private static func budgetRow(_ k: String, _ v: String, bold: Bool, writer w: Writer, running: String?) {
        let font = UIFont.systemFont(ofSize: bold ? 12 : 10.5, weight: bold ? .bold : .regular)
        let keyW = contentWidth * 0.46, valW = contentWidth * 0.54 - 16
        let h = max(measure(k, font: font, width: keyW - 12), measure(v, font: font, width: valW)) + 12
        w.ensure(h, running: running)
        let top = w.y
        if bold { fill(w, CGRect(x: margin, y: top, width: contentWidth, height: h), tint, radius: 6) }
        w.y = top + 6
        w.text(k, font: font, color: ink, x: margin + 8, width: keyW - 12)
        w.y = top + 6
        w.text(v, font: font, color: bold ? blue : ink, x: margin + keyW + 8, width: valW)
        w.y = top + h
        if !bold, !w.counting {
            line.setStroke()
            let path = UIBezierPath(); path.move(to: CGPoint(x: margin, y: w.y)); path.addLine(to: CGPoint(x: margin + contentWidth, y: w.y))
            path.lineWidth = 0.5; path.stroke()
        }
    }
}
