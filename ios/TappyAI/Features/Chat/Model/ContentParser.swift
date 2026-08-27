import Foundation

/// Parses assistant message content for structured blocks — exact port of Web's
/// parseCTA / parsePlan / parseFollowups pipeline (ChatInterface.tsx).
enum ContentParser {

    static func parse(_ content: String) -> ParsedContent {
        let (textAfterPlan, plan) = parsePlan(content)
        let (textAfterCta, buttons) = parseCTA(textAfterPlan)
        let (textAfterFollowups, followups) = parseFollowups(textAfterCta)
        let (textAfterShopping, shopping) = parseShopping(textAfterFollowups)
        let images = extractImages(textAfterShopping)
        let text = stripImages(textAfterShopping)
        return ParsedContent(text: text, ctaButtons: buttons, plan: plan, followups: followups, images: images, shopping: shopping)
    }

    // MARK: - Shopping decision

    /// Extracts the `[TAPPY_SHOPPING]{json}[/TAPPY_SHOPPING]` block: returns the text WITHOUT the
    /// marker (never a raw JSON leak) and the decoded decision (nil if absent / malformed / empty).
    /// Exact port of Web's `parseShoppingMarker` — the app owns delivery; the model never writes it.
    static func parseShopping(_ content: String) -> (text: String, shopping: ShoppingDecision?) {
        guard let regex = try? NSRegularExpression(pattern: #"\[TAPPY_SHOPPING\]([\s\S]*?)\[/TAPPY_SHOPPING\]"#, options: .caseInsensitive) else {
            return (stripShoppingRemnants(content), nil)
        }
        let range = NSRange(content.startIndex..., in: content)
        guard let m = regex.firstMatch(in: content, range: range),
              let jsonRange = Range(m.range(at: 1), in: content) else {
            // No closed pair. This is the mid-stream frame: the opening marker has arrived and the
            // payload has not. Strip rather than draw raw JSON.
            return (stripShoppingRemnants(content), nil)
        }
        // Trimmed explicitly: once both tags are gone `stripShoppingRemnants` finds no token and
        // returns its input untouched, so without this the function would stop trimming on the
        // success path — which it has always done.
        let text = stripShoppingRemnants(regex.stringByReplacingMatches(in: content, range: range, withTemplate: ""))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let jsonStr = String(content[jsonRange]).trimmingCharacters(in: .whitespaces)
        guard let data = jsonStr.data(using: .utf8),
              let decision = try? JSONDecoder().decode(ShoppingDecision.self, from: data),
              !decision.entities.isEmpty else {
            return (text, nil)
        }
        return (text, decision)
    }

    /// Removes what the closed-pair match cannot: a marker whose payload is still arriving, and any
    /// orphan half-tag.
    ///
    /// `ChatMessageList` re-parses on every render, INCLUDING mid-stream, so the frame before the
    /// closing tag lands carries `[TAPPY_SHOPPING]{"v":1,"entit…`. Without this it is drawn as raw
    /// JSON for as long as the rest takes to arrive — the leak Android shipped and fixed in vc10.
    /// Web does the same thing by treating a missing close tag as "strip to end of content".
    private static func stripShoppingRemnants(_ content: String) -> String {
        // No marker token at all ⇒ return the string untouched, so the trim below cannot silently
        // reshape whitespace on every ordinary reply. The bare token (no brackets) is checked so an
        // opening marker, a lone closing tag and a half-typed one all qualify.
        guard content.range(of: "TAPPY_SHOPPING", options: .caseInsensitive) != nil else { return content }
        var out = content
        if let partial = try? NSRegularExpression(pattern: #"\[TAPPY_SHOPPING\][\s\S]*$"#, options: .caseInsensitive) {
            out = partial.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out), withTemplate: "")
        }
        if let orphan = try? NSRegularExpression(pattern: #"\[/?TAPPY_SHOPPING\]"#, options: .caseInsensitive) {
            out = orphan.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out), withTemplate: "")
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - CTA Buttons

    static func parseCTA(_ content: String) -> (text: String, buttons: [CTAButton]) {
        // [CTA_BUTTONS]…[/CTA_BUTTONS] first; otherwise the bare [CTA_BUTTONS]{…} form.
        //
        // The bare form used to be anchored to end-of-content (`…\}\s*$`). The model emits
        // [FOLLOWUPS] AFTER the CTA block and followups are parsed after this step, so something
        // still trailed the block, the anchor failed, nothing was stripped — and once the followups
        // line went, the CTA JSON was left sitting in the visible text. Found in a live Web reply
        // and fixed there in #197; iOS carried the identical pattern.
        //
        // Dropping the `$` would be worse: `\{[\s\S]*\}` runs greedily to the LAST brace in the
        // message and swallows trailing prose. The payload is located by matching braces instead,
        // so its position stops mattering.
        let withTag = try? NSRegularExpression(pattern: #"\[CTA_BUTTONS\]([\s\S]*?)\[/CTA_BUTTONS\]"#, options: .caseInsensitive)
        let range = NSRange(content.startIndex..., in: content)

        var text: String
        let jsonStr: String

        if let r = withTag, let m = r.firstMatch(in: content, range: range),
           let jsonRange = Range(m.range(at: 1), in: content) {
            text = r.stringByReplacingMatches(in: content, range: range, withTemplate: "")
            jsonStr = String(content[jsonRange]).trimmingCharacters(in: .whitespaces)
        } else if let span = markerJSONSpan(content, marker: "[CTA_BUTTONS]") {
            text = content.replacingCharacters(in: span.full, with: "")
            jsonStr = String(content[span.json])
        } else {
            // No decodable block. Anything marker-shaped left over is still stripped below so a
            // half-arrived payload or an orphan tag can never be drawn.
            return (stripCTARemnants(content), [])
        }

        text = stripCTARemnants(text).trimmingCharacters(in: .whitespacesAndNewlines)

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

    /// Locates `marker` followed by a JSON object, by matching braces.
    ///
    /// Returns the range covering marker+payload (to remove) and the payload's own range (to
    /// decode), or nil when the marker is absent or its braces never balance — which is what a
    /// still-arriving payload looks like.
    ///
    /// Braces inside JSON strings are skipped and `\"` is honoured, so a `}` in a label or a
    /// URL-encoded `%7B` cannot end the scan early.
    private static func markerJSONSpan(
        _ content: String,
        marker: String
    ) -> (full: Range<String.Index>, json: Range<String.Index>)? {
        guard let markerRange = content.range(of: marker, options: .caseInsensitive) else { return nil }

        var i = markerRange.upperBound
        while i < content.endIndex, content[i].isWhitespace { i = content.index(after: i) }
        guard i < content.endIndex, content[i] == "{" else { return nil }
        let jsonStart = i

        var depth = 0
        var inString = false
        var escaped = false
        while i < content.endIndex {
            let c = content[i]
            if escaped {
                escaped = false
            } else if inString {
                if c == "\\" { escaped = true } else if c == "\"" { inString = false }
            } else if c == "\"" {
                inString = true
            } else if c == "{" {
                depth += 1
            } else if c == "}" {
                depth -= 1
                if depth == 0 {
                    let after = content.index(after: i)
                    return (markerRange.lowerBound..<after, jsonStart..<after)
                }
            }
            i = content.index(after: i)
        }
        return nil
    }

    /// Strips a CTA payload whose braces never balanced (still streaming) and any orphan tag, so
    /// neither is ever drawn. Mirrors the safety net FOLLOWUPS already has.
    private static func stripCTARemnants(_ content: String) -> String {
        // No marker token ⇒ untouched. The trim below must not silently reshape whitespace on every
        // ordinary reply; callers that matched a block trim for themselves, as they always did.
        guard content.range(of: "CTA_BUTTONS", options: .caseInsensitive) != nil else { return content }
        var out = content
        if let partial = try? NSRegularExpression(pattern: #"\[CTA_BUTTONS\][\s\S]*$"#, options: .caseInsensitive) {
            out = partial.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out), withTemplate: "")
        }
        if let orphan = try? NSRegularExpression(pattern: #"\[/?CTA_BUTTONS\]"#, options: .caseInsensitive) {
            out = orphan.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out), withTemplate: "")
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
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
