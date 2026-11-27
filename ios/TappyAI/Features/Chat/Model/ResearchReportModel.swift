import Foundation

// Layout step 4 (owner spec 26/11, BƯỚC 4): the rules of the research report, decided from the server's frame and the report's own text. No
// percentage, no minutes estimate, no number the server did not send. Pure, so each rule is tested without a view.

enum ResearchReportModel {

    /// The excerpt of the summary card: the report's first section that is not the sources list, cut at a line boundary, at most 1600 characters,
    /// with links and citation marks removed (the link text stays, `[1]` goes).
    static let excerptLimit = 1600

    static func excerpt(_ report: String) -> String {
        let lines = report.components(separatedBy: "\n")
        var section: [String] = []
        var started = false
        for line in lines {
            // The report's own «# » title is not a section; sections are the «## » headings.
            if isSectionHeading(line) {
                if started { break }   // the first section ends at the next heading
                if isSourcesHeading(line) { continue }
                started = true
                continue
            }
            if isTitleLine(line) { continue }
            if !started && section.isEmpty && line.trimmingCharacters(in: .whitespaces).isEmpty { continue }
            section.append(line)
        }
        if !started {
            // No section heading: the report's opening lines, up to a sources line.
            section = []
            for line in lines {
                if isSourcesHeading(line) || isSourcesLabel(line) { break }
                if isTitleLine(line) { continue }
                section.append(line)
            }
        }
        let cleaned = clean(section.joined(separator: "\n")).trimmingCharacters(in: .whitespacesAndNewlines)
        return cut(cleaned, limit: excerptLimit)
    }

    /// The number of sources to name: the larger of the server's link list and the numbered lines under the sources heading.
    static func sourceCount(report: String, links: Int) -> Int {
        var numbered = 0
        var inSources = false
        for line in report.components(separatedBy: "\n") {
            if isHeading(line) { inSources = isSourcesHeading(line); continue }
            if inSources, isNumberedLine(line) { numbered += 1 }
        }
        return max(links, numbered)
    }

    /// A text is a report (and not a short answer) when it is long and has at least four sections (spec §5: an older chat's report is recognised
    /// from its text, since the chart and card frames are not stored).
    static func isReport(_ text: String) -> Bool {
        text.count >= 8000 && text.components(separatedBy: "\n").filter { $0.hasPrefix("## ") }.count >= 4
    }

    /// Which step rows the card draws while the report is being written: the finished steps and the one being written; the waiting ones are
    /// not drawn, so the card shows where the research stands without a percentage.
    static func visibleSteps<T>(_ steps: [T], phase: ResearchPhase, status: (T) -> ResearchStepStatus) -> [T] {
        guard phase == .writing else { return steps }
        return steps.filter { status($0) == .done || status($0) == .running }
    }

    /// The report's `##` sections, in order: the title (without the marks) and the body under it. Text before the first heading is the first
    /// section, titled «Mở đầu». The sources section is kept (the page's «Nguồn» tab names the same links).
    static let introTitle = "Mở đầu"

    static func sections(_ report: String) -> [(title: String, body: String)] {
        var out: [(title: String, body: String)] = []
        var title = introTitle
        var body: [String] = []
        func flush() {
            let text = body.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty || title != introTitle { out.append((title, text)) }
        }
        for line in report.components(separatedBy: "\n") {
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("## ") {
                flush()
                title = String(line.trimmingCharacters(in: .whitespaces).dropFirst(3)).trimmingCharacters(in: .whitespaces)
                body = []
            } else {
                body.append(line)
            }
        }
        flush()
        return out
    }

    // MARK: Text helpers

    private static func isHeading(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces)
        return t.hasPrefix("## ") || t.hasPrefix("# ")
    }

    /// A section: a «## » heading (the report's sections).
    private static func isSectionHeading(_ line: String) -> Bool {
        line.trimmingCharacters(in: .whitespaces).hasPrefix("## ")
    }

    /// The report's own title: a «# » line.
    private static func isTitleLine(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces)
        return t.hasPrefix("# ") && !t.hasPrefix("## ")
    }

    /// A plain line that starts the sources list («Nguồn:», «Sources:») when the report has no heading for it.
    private static func isSourcesLabel(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces).lowercased()
        return t.hasPrefix("nguồn:") || t.hasPrefix("sources:")
    }

    private static func isSourcesHeading(_ line: String) -> Bool {
        let t = line.lowercased()
        return isHeading(line) && (t.contains("nguồn") || t.contains("sources") || t.contains("tài liệu tham khảo") || t.contains("references"))
    }

    private static func isNumberedLine(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard let dot = t.firstIndex(of: "."), dot != t.startIndex else { return false }
        return t[t.startIndex..<dot].allSatisfy { $0.isNumber }
    }

    /// Removes `[text](url)` → text and `[n]` citation marks, and the bold/heading marks of the excerpt.
    static func clean(_ text: String) -> String {
        var t = text
        t = t.replacingOccurrences(of: #"\[([^\]]*)\]\([^)]*\)"#, with: "$1", options: .regularExpression)
        t = t.replacingOccurrences(of: #"\[\d+\]"#, with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: "**", with: "")
        return t.replacingOccurrences(of: #" {2,}"#, with: " ", options: .regularExpression)
    }

    /// The text cut at a line boundary at or below `limit` characters; a single line longer than the limit is cut at the limit.
    static func cut(_ text: String, limit: Int) -> String {
        guard text.count > limit else { return text }
        let head = String(text.prefix(limit))
        if let lastBreak = head.lastIndex(of: "\n"), head.distance(from: head.startIndex, to: lastBreak) > limit / 2 {
            return String(head[..<lastBreak]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return head
    }
}
