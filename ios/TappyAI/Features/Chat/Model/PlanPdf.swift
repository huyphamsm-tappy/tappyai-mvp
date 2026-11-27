import UIKit

/// A trip plan as the report text the PDF writer already lays out (web `src/lib/answerDoc/planMarkdown.ts`, owner 19/11: "will the plan look this
/// good as a PDF file?"): a title, the facts line, one `##` section per day, the stays and dishes, the budget as a table and the tips.
/// Only what the plan itself states is written; nothing is added or summed (the total is the plan's own `budget_total`). Pure.
enum PlanMarkdown {

    /// The words of the file. `stays` and `dishes` are the section headings; when nil those sections are not written.
    struct Labels: Equatable, Sendable {
        var facts: String
        var budget: String
        var item: String
        var cost: String
        var tips: String
        var total: String
        var stays: String?
        var dishes: String?
    }

    /// One line of text: whitespace collapsed, a pipe turned into a slash (it would cut a table cell), trimmed.
    static func clean(_ s: String?) -> String {
        guard let s else { return "" }
        let collapsed = s.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return collapsed.replacingOccurrences(of: "|", with: "/").trimmingCharacters(in: .whitespaces)
    }

    private static func join(_ parts: [String?]) -> String { parts.map(clean).filter { !$0.isEmpty }.joined(separator: " ") }

    static func build(_ plan: TappyPlan, labels: Labels) -> String {
        var out: [String] = ["# " + clean(plan.title), ""]
        if !labels.facts.isEmpty { out += [labels.facts, ""] }
        for day in plan.days {
            out += ["## " + clean(day.label), ""]
            for it in day.items {
                let head = [clean(it.time), clean(it.name)].filter { !$0.isEmpty }.joined(separator: " - ")
                let tail = join([it.description, it.price, it.address])
                out.append("- **" + head + "**" + (tail.isEmpty ? "" : " - " + tail))
            }
            out.append("")
        }
        if let heading = labels.stays {
            let rows: [String] = (plan.stays ?? []).compactMap { s in
                let name = clean(s.name)
                guard !name.isEmpty else { return nil }
                let tail = join([s.why, s.price, s.address])
                return "- **" + name + "**" + (tail.isEmpty ? "" : " - " + tail)
            }
            if !rows.isEmpty { out += ["## " + heading, ""] + rows + [""] }
        }
        if let heading = labels.dishes {
            let rows: [String] = (plan.dishes ?? []).compactMap { d in
                let dish = clean(d.dish)
                guard !dish.isEmpty else { return nil }
                let tail = join([d.venue, d.address, d.price, d.note])
                return "- **" + dish + "**" + (tail.isEmpty ? "" : " - " + tail)
            }
            if !rows.isEmpty { out += ["## " + heading, ""] + rows + [""] }
        }
        let costRows = (plan.costBreakdown ?? []).map { (clean($0.key), clean($0.value)) }.filter { !$0.0.isEmpty && !$0.1.isEmpty }
        if !costRows.isEmpty || plan.budgetTotal != nil {
            out += ["## " + labels.budget, "", "| " + labels.item + " | " + labels.cost + " |", "| --- | --- |"]
            for (k, v) in costRows { out.append("| " + k + " | " + v + " |") }
            if let total = plan.budgetTotal { out.append("| " + labels.total + " | " + clean(total) + " |") }
            out.append("")
        }
        let tips = (plan.localTips ?? []).map { clean($0.text) }.filter { !$0.isEmpty }
        if !tips.isEmpty { out += ["## " + labels.tips, ""] + tips.map { "- " + $0 } + [""] }
        return out.joined(separator: "\n")
    }

    /// "3 ngày · 12 điểm dừng · 2 người · 6.000.000đ": the plan's own counts and its own budget (web `tripFacts`). Nothing is estimated.
    static func facts(_ plan: TappyPlan, days: (Int) -> String, stops: (Int) -> String, people: (Int) -> String) -> String {
        var parts = [days(plan.days.count), stops(plan.days.reduce(0) { $0 + $1.items.count })]
        if let n = plan.people, n > 1 { parts.append(people(n)) }
        if let budget = plan.budgetTotal?.trimmingCharacters(in: .whitespacesAndNewlines), !budget.isEmpty { parts.append(budget) }
        return parts.joined(separator: " · ")
    }
}

/// The plan as a PDF file: the plan's text through the same A4 writer the research report uses. Built on the phone; nothing is sent anywhere.
enum PlanPdf {

    /// The words in the app's own language (the catalogue's `chat.plan.pdf*` keys).
    static func labels(for plan: TappyPlan) -> PlanMarkdown.Labels {
        func text(_ key: String) -> String { NSLocalizedString(key, comment: "") }
        func count(_ key: String) -> (Int) -> String { { n in text(key).replacingOccurrences(of: "{n}", with: String(n)) } }
        let facts = PlanMarkdown.facts(plan, days: count("chat.plan.pdfDays"), stops: count("chat.plan.pdfStops"), people: count("chat.plan.pdfPeople"))
        return PlanMarkdown.Labels(facts: facts, budget: text("chat.plan.pdfBudget"), item: text("chat.plan.pdfItem"), cost: text("chat.plan.pdfCost"),
                                   tips: text("chat.plan.pdfTips"), total: text("chat.plan.pdfTotal"),
                                   stays: text("chat.plan.stays"), dishes: text("chat.plan.dishes"))
    }

    /// The file's bytes. Heavy for a long plan: the card calls it off the main thread.
    static func data(for plan: TappyPlan, labels: PlanMarkdown.Labels) -> Data {
        writeReportPdf(title: plan.title, blocks: pdfBlocks(PlanMarkdown.build(plan, labels: labels)))
    }

    static func fileName(for plan: TappyPlan) -> String { reportFileName(plan.title, "pdf") }

    /// The key a stop's picture is stored under: the same normalised name `tappy.subject_images.v1` uses for its stops.
    static func pictureKey(for item: TappyPlan.PlanItem) -> String { SubjectImages.key(item.name) }

    /// The DESIGNED file (header band, a photo beside each stop that has one, stays, dishes, budget table, tips, page numbers): the pictures are
    /// downloaded first (at most 24, a few seconds each, a failed one is simply left out), then the pages are drawn. Heavy: call it off the main thread.
    static func dataWithPictures(for plan: TappyPlan, labels: PlanMarkdown.Labels, stopImages: [String: URL]) async -> Data {
        var urls: [String: URL] = [:]
        for day in plan.days {
            for item in day.items where urls.count < 24 {
                let key = pictureKey(for: item)
                guard urls[key] == nil else { continue }
                if let own = item.photoUrl, let url = safeWebURL(own) { urls[key] = url }
                else if let found = stopImages[key] { urls[key] = found }
            }
        }
        let images = await TripPdfPictures.load(urls)
        let words = TripPdfRenderer.Words(stays: labels.stays ?? "", dishes: labels.dishes ?? "", budget: labels.budget, item: labels.item,
                                          cost: labels.cost, total: labels.total, tips: labels.tips)
        return TripPdfRenderer.render(plan: plan, facts: labels.facts, words: words, images: images)
    }
}

/// The pictures of a plan's stops for the PDF: downloaded concurrently, bounded in time and size, scaled down (a photo of 4000 px has no place in a
/// file of a few hundred KB). A picture that does not arrive is not in the result.
enum TripPdfPictures {
    static let maxBytes = 3_000_000
    static let maxSide: CGFloat = 260

    static func load(_ urls: [String: URL]) async -> [String: UIImage] {
        await withTaskGroup(of: (String, UIImage?).self) { group in
            for (key, url) in urls {
                group.addTask { (key, await fetch(url)) }
            }
            var out: [String: UIImage] = [:]
            for await (key, image) in group { if let image { out[key] = image } }
            return out
        }
    }

    private static func fetch(_ url: URL) async -> UIImage? {
        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true,
              data.count <= maxBytes, let image = UIImage(data: data) else { return nil }
        return scaled(image)
    }

    private static func scaled(_ image: UIImage) -> UIImage {
        let longest = max(image.size.width, image.size.height)
        guard longest > maxSide else { return image }
        let k = maxSide / longest
        let size = CGSize(width: image.size.width * k, height: image.size.height * k)
        return UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }
}
