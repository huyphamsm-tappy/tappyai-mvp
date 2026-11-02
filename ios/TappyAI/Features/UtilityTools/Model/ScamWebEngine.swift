import Foundation

/// The message verdict with the AI switched off, computed the way the Web server computes it
/// (`message/rules.ts` + `message/fusion.ts` + `verdict.ts`, Web final): the deterministic social-engineering rules, the
/// scenario floor, then the score bands. «Familiar» is level HIGH or a STRONG scenario match; «suspicious» is level MEDIUM or a
/// WEAK match; anything else is «unrecognized» — never «safe».
///
/// The rule patterns are generated from the Web file (`ScamWebRules.swift`); only the evaluation around them is written here.
/// The phone checks no link on its own (the person taps «check link»), so a link never raises the level here the way the
/// Web server's link engine can; a message that is only a link stays «unrecognized» until that check runs.
enum ScamWebEngine {

    // MARK: Normalisation (Web `normalizeMessage` + `normalizeVN`)

    private static let stripped: Set<UInt32> = {
        var s = Set<UInt32>()
        for r in [0x0000...0x0008, 0x000B...0x000C, 0x000E...0x001F, 0x007F...0x007F, 0x00AD...0x00AD, 0x200B...0x200F,
                  0x202A...0x202E, 0x2060...0x2064, 0xFEFF...0xFEFF] { for v in r { s.insert(UInt32(v)) } }
        return s
    }()

    private static let fullwidth: [UInt32: String] = [
        0xFF1A: ":", 0xFF0C: ",", 0x3002: ".", 0xFF01: "!", 0xFF1F: "?", 0xFF08: "(", 0xFF09: ")", 0x3010: "[", 0x3011: "]",
        0x201C: "\"", 0x201D: "\"", 0x2018: "'", 0x2019: "'", 0xFF1C: "<", 0xFF1E: ">", 0xFF0F: "/", 0xFF20: "@",
    ]

    /// NFC, control and zero-width characters out, full-width punctuation to ASCII; then lower-case, no diacritics, đ → d.
    static func normalize(_ raw: String) -> String {
        var step = ""
        for scalar in raw.precomposedStringWithCanonicalMapping.unicodeScalars {
            if stripped.contains(scalar.value) { continue }
            step += fullwidth[scalar.value] ?? String(scalar)
        }
        var out = ""
        for scalar in step.lowercased().decomposedStringWithCanonicalMapping.unicodeScalars {
            if (0x0300...0x036F).contains(scalar.value) { continue }
            out += scalar == "\u{0111}" ? "d" : String(scalar)
        }
        return out
    }

    // MARK: Rules

    private static func compile(_ pattern: String) -> NSRegularExpression? { try? NSRegularExpression(pattern: pattern) }

    private static let compiled: [(rule: ScamWebRules.Rule, regexes: [NSRegularExpression])] = ScamWebRules.rules.map { rule in
        (rule, rule.patterns.compactMap { compile($0) })
    }
    /// Zero when every generated pattern compiled under ICU (a test pins it): a pattern that did not would silently never match.
    static var uncompiledPatternCount: Int {
        ScamWebRules.rules.reduce(0) { $0 + $1.patterns.count } - compiled.reduce(0) { $0 + $1.regexes.count }
            + (compile(ScamWebRules.impersonationTargets) == nil ? 1 : 0)
            + (compile(ScamWebRules.negationWords) == nil ? 1 : 0)
            + (compile(ScamWebRules.conditionalBefore) == nil ? 1 : 0)
    }
    private static let impersonation = compile(ScamWebRules.impersonationTargets)
    private static let negation = compile(ScamWebRules.negationWords)
    private static let conditional = compile(ScamWebRules.conditionalBefore)

    /// Signals that only mean something when a brand is being borrowed (Web `REQUEST_LIKE`).
    private static let requestLike: Set<String> = [
        "account_suspension_threat", "fake_security_alert", "verify_phone_request", "verify_account_request",
        "otp_request", "password_request", "pin_request", "transfer_request", "payment_request",
        "remote_access_request", "app_install_request", "reward_bait", "fake_legal_notice",
        "fake_customer_support", "link_click_request", "credential_entry_request", "urgency_pressure",
    ]

    struct Evaluation: Equatable {
        let score: Int
        /// The lowest level the verdict may report, from signal COMBINATIONS: nil, "MEDIUM" or "HIGH".
        let floor: String?
    }

    /// Is the sentence that leads into the match a negation of what it asks? (Web `negated`.)
    private static func negated(_ text: NSString, start: Int, end: Int) -> Bool {
        let from = max(0, start - 60)
        let window = text.substring(with: NSRange(location: from, length: end - from)) as NSString
        let rel = start - from
        func lastIndex(of mark: String) -> Int {
            let r = window.range(of: mark, options: .backwards, range: NSRange(location: 0, length: min(rel + 1, window.length)))
            return r.location == NSNotFound ? -1 : r.location
        }
        let sentenceStart = max(lastIndex(of: "."), lastIndex(of: "!"), lastIndex(of: "?"), lastIndex(of: "\n")) + 1
        let sentence = window.substring(from: sentenceStart) as NSString
        guard let negation else { return false }
        for m in negation.matches(in: sentence as String, range: NSRange(location: 0, length: sentence.length)) {
            let index = m.range.location
            let lower = max(0, index - 16)
            let before = sentence.substring(with: NSRange(location: lower, length: index - lower))
            let conditionalHit = conditional?.firstMatch(in: before, range: NSRange(location: 0, length: (before as NSString).length)) != nil
            if !conditionalHit { return true }
        }
        return false
    }

    /// Web `evaluateRules`, on text already normalised.
    static func evaluate(normalized: String, hasUrl: Bool) -> Evaluation {
        let ns = normalized as NSString
        let full = NSRange(location: 0, length: ns.length)
        var matched = Set<String>()
        var highSeverity = false
        var score = 0

        for (rule, regexes) in compiled {
            var hit = false
            for re in regexes {
                for m in re.matches(in: normalized, range: full) {
                    if rule.negatable && negated(ns, start: m.range.location, end: m.range.location + m.range.length) { continue }
                    hit = true
                    break
                }
                if hit { break }
            }
            guard hit else { continue }
            matched.insert(rule.type)
            score += rule.weight
            if rule.severity == "high" { highSeverity = true }
        }

        // Impersonation is contextual: a brand name next to a request is the request's disguise.
        let brand = impersonation?.firstMatch(in: normalized, range: full) != nil
        if brand && (matched.contains { requestLike.contains($0) } || hasUrl) {
            matched.insert("impersonation")
            score += 10
        }

        func has(_ types: String...) -> Bool { types.contains { matched.contains($0) } }
        let credentialAsk = has("verify_phone_request", "verify_account_request", "otp_request", "password_request", "pin_request",
                                "credential_entry_request", "link_click_request") || hasUrl
        let moneyAsk = has("transfer_request", "crypto_request", "payment_request")
        let pressure = has("urgency_pressure", "fear_threat_language", "account_suspension_threat", "fake_legal_notice", "reward_bait",
                           "investment_promise", "impersonation", "fake_security_alert")

        var floor: String?
        if (has("account_suspension_threat", "fake_security_alert", "fake_legal_notice") && credentialAsk)
            || (moneyAsk && pressure)
            || (has("remote_access_request", "app_install_request") && (pressure || has("fake_customer_support")))
            || (has("otp_request", "password_request", "pin_request") && (pressure || hasUrl)) {
            floor = "HIGH"
        } else if has("prompt_injection_attempt") || highSeverity {
            floor = "MEDIUM"
        }
        return Evaluation(score: min(100, score), floor: floor)
    }

    // MARK: Verdict

    /// The score bands of the Web `LEVEL_THRESHOLDS`: ≤10 safe, ≤30 low, ≤55 medium, ≤80 high, else critical.
    static func band(_ score: Int) -> String {
        score <= 10 ? "SAFE" : score <= 30 ? "LOW" : score <= 55 ? "MEDIUM" : score <= 80 ? "HIGH" : "CRITICAL"
    }

    private static func letterCount(_ text: String) -> Int { text.unicodeScalars.filter { CharacterSet.letters.contains($0) }.count }

    /// `raw`: the pasted message. `links`: the links found in it. `scenario`: the best scenario match (`ScamScenarioMatcher`).
    static func verdict(raw: String, links: [String], scenario: ScamScenarioMatcher.Match?) -> ScamVerdict {
        var prose = raw
        for link in links { prose = prose.replacingOccurrences(of: link, with: " ") }
        let letters = letterCount(prose)
        let hasUrl = !links.isEmpty
        // LEVEL 0: a bare link (or nothing to read) is the link check's business — unless a scenario matched.
        let bare = (hasUrl && letters <= 12) || (!hasUrl && letters == 0)
        if bare && scenario == nil { return .unrecognized }

        let evaluation = evaluate(normalized: normalize(raw), hasUrl: hasUrl)
        let floorScore = evaluation.floor == "HIGH" ? 60 : evaluation.floor == "MEDIUM" ? 31 : 0
        let scenarioFloor = scenario.map { $0.strength == .strong ? 60 : 31 } ?? 0
        let score = max(min(evaluation.score, 80), floorScore, scenarioFloor)
        let level = band(score)

        if scenario?.strength == .strong || level == "HIGH" || level == "CRITICAL" { return .familiar }
        if scenario?.strength == .weak || level == "MEDIUM" { return .suspicious }
        return .unrecognized
    }
}
