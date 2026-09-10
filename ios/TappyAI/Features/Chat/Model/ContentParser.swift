import Foundation

/// Parses assistant message content for structured blocks — exact port of Web's
/// parsePlan / parseCTA / parseFollowups / parseShoppingMarker pipeline (ChatInterface.tsx).
///
/// 🚨 THE MARKER CONTRACT. The server owns a CLOSED set of marker blocks and injects them into the
/// assistant TEXT stream — the only channel that survives persistence and reload. It does not know
/// or care which client is reading. So every marker the server can emit must be handled HERE, or
/// its raw JSON renders as message body. `[TAPPY_SHOPPING]` shipped web-only and did exactly that
/// (P0-1), the same way `[CTA_BUTTONS]` did before it. When a marker is added server-side, this
/// file and Android `ChatResponseParser` are part of that change, not a follow-up to it.
enum ContentParser {

    static func parse(_ content: String) -> ParsedContent {
        let (textAfterPlan, plan) = parsePlan(content)
        let (textAfterCta, buttons) = parseCTA(textAfterPlan)
        let (textAfterFollowups, followups) = parseFollowups(textAfterCta)
        // D1 — decode the shopping decision instead of discarding it. Decode and strip stay
        // independent: `stripMarkerResidue` below runs regardless, because a block we cannot
        // understand is still a block the user must not read.
        let shopping = decodeShoppingDecision(textAfterFollowups)
        let clean = stripMarkerResidue(textAfterFollowups)
        let images = extractImages(clean)
        let text = stripImages(clean)
        return ParsedContent(
            text: text,
            ctaButtons: buttons,
            plan: plan,
            followups: followups,
            images: images,
            shopping: shopping
        )
    }

    // MARK: - Shopping decision (D1)

    /// Decodes the `[TAPPY_SHOPPING]` payload into its model.
    ///
    /// Reads only the CLOSED form: an unterminated block is a decision still arriving, and half a
    /// decision is not a decision. It never mutates the text — stripping remains the residue pass's
    /// job, so a payload that fails to decode still cannot reach the user.
    static func decodeShoppingDecision(_ content: String) -> ShoppingDecisionView? {
        guard let regex = try? NSRegularExpression(
            pattern: #"\[TAPPY_SHOPPING\]([\s\S]*?)\[/TAPPY_SHOPPING\]"#,
            options: .caseInsensitive
        ) else { return nil }

        let range = NSRange(content.startIndex..., in: content)
        guard let m = regex.firstMatch(in: content, range: range),
              let bodyRange = Range(m.range(at: 1), in: content) else { return nil }

        let body = String(content[bodyRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard let data = body.data(using: .utf8),
              let view = try? JSONDecoder().decode(ShoppingDecisionView.self, from: data),
              !view.entities.isEmpty // an empty decision is not a decision
        else { return nil }

        return view
    }

    // MARK: - CTA Buttons

    /// Where a brace-matched marker payload sits inside the content.
    private struct MarkerSpan {
        let start: String.Index
        let end: String.Index
        let json: String
    }

    /// Locates the `{…}` payload that follows `marker` by matching braces — the Swift twin of web's
    /// `findMarkerJson` (ChatInterface.tsx) and Android's `findMarkerJson` (ChatResponse.kt).
    ///
    /// Brace matching rather than a regex because the block's POSITION is not fixed: another marker
    /// may follow it. Braces inside JSON strings are skipped and `\"` is honoured, so a `}` in a
    /// label or URL cannot end the scan early. Returns nil when the braces do not balance, which is
    /// a payload still arriving mid-stream — a normal outcome, not a corrupt stream.
    private static func findMarkerJson(_ content: String, _ marker: String) -> MarkerSpan? {
        guard let markerRange = content.range(of: marker, options: .caseInsensitive) else { return nil }

        var open = markerRange.upperBound
        while open < content.endIndex, content[open].isWhitespace { open = content.index(after: open) }
        guard open < content.endIndex, content[open] == "{" else { return nil }

        var depth = 0
        var inString = false
        var escaped = false
        var i = open
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
                    let end = content.index(after: i)
                    return MarkerSpan(start: markerRange.lowerBound, end: end, json: String(content[open..<end]))
                }
            }
            i = content.index(after: i)
        }
        return nil // payload still arriving — braces do not balance yet
    }

    static func parseCTA(_ content: String) -> (text: String, buttons: [CTAButton]) {
        // D2 FIX (P4-02). The bare form is located by BRACE MATCHING, not by an end-anchored regex.
        //
        // It used to be `\[CTA_BUTTONS\](\{[\s\S]*\})\s*$`. The model emits `[FOLLOWUPS]` AFTER the
        // CTA block and followups are stripped later in the chain, so at this point something still
        // trailed the block, `\s*$` could not match, and the buttons were silently LOST. On iOS the
        // block itself did not reach the user — `stripMarkerResidue`'s end-anchored pattern removed
        // it — but that pattern also deleted EVERY CHARACTER AFTER IT, so any prose the model wrote
        // following the CTA block disappeared too.
        //
        // Dropping the `$` is worse, not better: `\{[\s\S]*\}` runs greedily to the LAST brace in
        // the message and swallows trailing prose. Web settled on brace matching after hitting both
        // failures; Android and iOS now use the same algorithm, pinned by the shared fixtures in
        // shared/structured-content/marker-fixtures.json.
        let withTag = try? NSRegularExpression(pattern: #"\[CTA_BUTTONS\]([\s\S]*?)\[/CTA_BUTTONS\]"#, options: .caseInsensitive)
        let range = NSRange(content.startIndex..., in: content)

        var text: String
        var jsonStr: String?

        if let r = withTag, let m = r.firstMatch(in: content, range: range),
           let jsonRange = Range(m.range(at: 1), in: content) {
            jsonStr = String(content[jsonRange]).trimmingCharacters(in: .whitespaces)
            text = r.stringByReplacingMatches(in: content, range: range, withTemplate: "")
        } else if let span = findMarkerJson(content, "[CTA_BUTTONS]") {
            jsonStr = span.json.trimmingCharacters(in: .whitespaces)
            text = String(content[content.startIndex..<span.start]) + String(content[span.end...])
        } else {
            return (content, [])
        }

        // Any FURTHER block is stripped without rendering: only the first has ever produced
        // buttons, and a leftover second block would otherwise show as raw JSON.
        while let extra = findMarkerJson(text, "[CTA_BUTTONS]") {
            text = String(text[text.startIndex..<extra.start]) + String(text[extra.end...])
        }
        text = text.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let json = jsonStr,
              let data = json.data(using: .utf8),
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

    // MARK: - Marker residue (P0-1)

    /// Every marker block name the server can emit.
    ///
    /// ONE list, so "which markers exist" is a single fact rather than a property spread across
    /// four parse functions that each learned about markers at a different time. That drift is
    /// what produced this bug: `[TAPPY_SHOPPING]` was added server-side and taught to the web
    /// only, and iOS rendered its JSON as message body. When the server gains a marker, it is
    /// added here.
    static let markerNames = ["TAPPY_PLAN", "CTA_BUTTONS", "FOLLOWUPS", "TAPPY_SHOPPING"]

    /// Removes every marker block the decode steps did not consume.
    ///
    /// Runs AFTER parsePlan / parseCTA / parseFollowups, so each of those has already taken the
    /// block it understands; what is left here is residue, and residue must never render.
    ///
    /// Three shapes per marker, because one is not enough — the lesson `[CTA_BUTTONS]` taught
    /// and `[TAPPY_SHOPPING]` repeated:
    ///
    ///   closed        a whole block nothing claimed (a second CTA block, or the shopping block,
    ///                 which iOS decodes into nothing: the decision CARD is V3 UX/UI work, but the
    ///                 JSON must not reach the user in the meantime).
    ///   unterminated  a block whose closing tag never arrived. Reachable, not defensive: a
    ///                 planning turn runs at maxTokens 4096 and the rulebook tells the model not
    ///                 to shorten a plan, so a reply that stops at finishReason "length" ends
    ///                 mid-JSON. END-ANCHORED on purpose — a mid-text open tag falls through to
    ///                 the orphan strip instead of swallowing the rest of the reply.
    ///   orphan        a lone opening or closing tag whose partner was consumed upstream.
    static func stripMarkerResidue(_ content: String) -> String {
        var text = content
        for name in markerNames {
            let patterns = [
                #"\[\#(name)\][\s\S]*?\[/\#(name)\]"#,
                #"\[\#(name)\][\s\S]*$"#,
                #"\[/?\#(name)\]"#,
            ]
            for pattern in patterns {
                guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { continue }
                text = regex.stringByReplacingMatches(
                    in: text,
                    range: NSRange(text.startIndex..., in: text),
                    withTemplate: ""
                )
            }
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
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
