import Foundation

/// Parses assistant message content for structured blocks — exact port of Web's
/// parseCTA / parsePlan / parseFollowups pipeline (ChatInterface.tsx).
enum ContentParser {

    static func parse(_ content: String) -> ParsedContent {
        let (textAfterPlan, plan) = parsePlan(content)
        let (textAfterCta, buttons) = parseCTA(textAfterPlan)
        let (textAfterFollowups, followups) = parseFollowups(textAfterCta)
        let images = extractImages(textAfterFollowups)
        let text = stripImages(textAfterFollowups)
        return ParsedContent(text: text, ctaButtons: buttons, plan: plan, followups: followups, images: images)
    }

    // MARK: - CTA Buttons

    static func parseCTA(_ content: String) -> (text: String, buttons: [CTAButton]) {
        // Match [CTA_BUTTONS]...[/CTA_BUTTONS] or bare [CTA_BUTTONS]{...} at end
        let withTag = try? NSRegularExpression(pattern: #"\[CTA_BUTTONS\]([\s\S]*?)\[/CTA_BUTTONS\]"#, options: .caseInsensitive)
        let noTag = try? NSRegularExpression(pattern: #"\[CTA_BUTTONS\](\{[\s\S]*\})\s*$"#, options: .caseInsensitive)

        let range = NSRange(content.startIndex..., in: content)
        var match: NSTextCheckingResult?
        var regex: NSRegularExpression?

        if let r = withTag, let m = r.firstMatch(in: content, range: range) {
            match = m; regex = r
        } else if let r = noTag, let m = r.firstMatch(in: content, range: range) {
            match = m; regex = r
        }

        guard let m = match, let r = regex,
              let jsonRange = Range(m.range(at: 1), in: content) else {
            return (content, [])
        }

        let text = r.stringByReplacingMatches(in: content, range: range, withTemplate: "").trimmingCharacters(in: .whitespacesAndNewlines)
        let jsonStr = String(content[jsonRange]).trimmingCharacters(in: .whitespaces)

        guard let data = jsonStr.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let buttonsArr = obj["buttons"] as? [[String: Any]] else {
            return (text, [])
        }

        let buttons = buttonsArr.compactMap { dict -> CTAButton? in
            guard let label = dict["label"] as? String,
                  let type = dict["type"] as? String,
                  let url = dict["url"] as? String else { return nil }
            let primary = dict["primary"] as? Bool ?? false
            return CTAButton(label: label, type: type, url: url, primary: primary)
        }

        return (text, buttons)
    }

    // MARK: - Trip Plan

    static func parsePlan(_ content: String) -> (text: String, plan: TappyPlan?) {
        guard let regex = try? NSRegularExpression(pattern: #"\[TAPPY_PLAN\]([\s\S]*?)\[/TAPPY_PLAN\]"#, options: .caseInsensitive) else {
            return (content, nil)
        }
        let range = NSRange(content.startIndex..., in: content)
        guard let m = regex.firstMatch(in: content, range: range),
              let jsonRange = Range(m.range(at: 1), in: content) else {
            return (content, nil)
        }

        let text = regex.stringByReplacingMatches(in: content, range: range, withTemplate: "").trimmingCharacters(in: .whitespacesAndNewlines)
        let jsonStr = String(content[jsonRange]).trimmingCharacters(in: .whitespaces)

        guard let data = jsonStr.data(using: .utf8),
              let plan = try? JSONDecoder().decode(TappyPlan.self, from: data),
              !plan.days.isEmpty else {
            return (text, nil)
        }
        return (text, plan)
    }

    // MARK: - Follow-up suggestions

    static func parseFollowups(_ content: String) -> (text: String, followups: [String]) {
        guard let regex = try? NSRegularExpression(pattern: #"\[FOLLOWUPS\]([^\n]*?)(?:\[/FOLLOWUPS\]|\n|$)"#, options: .caseInsensitive) else {
            return (content, [])
        }
        let range = NSRange(content.startIndex..., in: content)
        var followups: [String] = []
        var text = content

        if let m = regex.firstMatch(in: content, range: range),
           let innerRange = Range(m.range(at: 1), in: content) {
            let inner = String(content[innerRange])
            followups = inner.components(separatedBy: "|")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            if followups.count > 3 { followups = Array(followups.prefix(3)) }
            text = regex.stringByReplacingMatches(in: content, range: range, withTemplate: "")
        }

        // Strip stray/orphan markers
        if let orphan = try? NSRegularExpression(pattern: #"\[/?FOLLOWUPS\]"#, options: .caseInsensitive) {
            text = orphan.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: "")
        }
        return (text.trimmingCharacters(in: .whitespacesAndNewlines), followups)
    }

    // MARK: - Extract markdown images

    static func extractImages(_ content: String) -> [ParsedImage] {
        guard let regex = try? NSRegularExpression(pattern: #"!\[([^\]]*)\]\((https?://[^\s)]+)\)"#) else {
            return []
        }
        let range = NSRange(content.startIndex..., in: content)
        var images: [ParsedImage] = []
        regex.enumerateMatches(in: content, range: range) { match, _, _ in
            guard let m = match,
                  let altRange = Range(m.range(at: 1), in: content),
                  let urlRange = Range(m.range(at: 2), in: content) else { return }
            images.append(ParsedImage(alt: String(content[altRange]), url: String(content[urlRange])))
        }
        return images
    }

    // MARK: - Strip markdown images

    static func stripImages(_ content: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"!\[([^\]]*)\]\(https?://[^\s)]+\)"#) else {
            return content
        }
        let range = NSRange(content.startIndex..., in: content)
        let result = regex.stringByReplacingMatches(in: content, range: range, withTemplate: "$1")
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Parse place from internal_booking URL

    static func parsePlaceFromUrl(_ urlString: String) -> (placeId: String, name: String, address: String, type: String)? {
        guard let comps = URLComponents(string: urlString) else { return nil }
        let items = comps.queryItems ?? []
        let placeId = items.first(where: { $0.name == "placeId" })?.value ?? ""
        guard !placeId.isEmpty else { return nil }
        let name = items.first(where: { $0.name == "name" })?.value ?? ""
        let address = items.first(where: { $0.name == "address" })?.value ?? ""
        let type = items.first(where: { $0.name == "type" })?.value ?? ""
        return (placeId, name, address, type)
    }

    // MARK: - Detect first place name from text/buttons

    static func detectFirstPlaceName(text: String, buttons: [CTAButton]) -> String {
        if let booking = buttons.first(where: { $0.type == "internal_booking" }),
           let comps = URLComponents(string: booking.url),
           let name = comps.queryItems?.first(where: { $0.name == "name" })?.value, !name.isEmpty {
            return name
        }
        if let regex = try? NSRegularExpression(pattern: #"\*\*([^*]{3,40})\*\*"#),
           let m = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
           let r = Range(m.range(at: 1), in: text) {
            return String(text[r])
        }
        return ""
    }

    // MARK: - Markdown → AttributedString

    static func renderMarkdown(_ text: String) -> AttributedString {
        do {
            var options = AttributedString.MarkdownParsingOptions()
            options.interpretedSyntax = .inlineOnlyPreservingWhitespace
            return try AttributedString(markdown: text, options: options)
        } catch {
            return AttributedString(text)
        }
    }
}
