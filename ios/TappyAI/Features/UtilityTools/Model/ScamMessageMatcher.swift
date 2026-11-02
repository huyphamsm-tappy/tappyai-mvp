import Foundation

/// Scam Shield · «Kiểm tra tin nhắn» — the ON-DEVICE half.
///
/// 🚨 PRIVACY. This file runs on the phone and never touches the network: the pasted message is not sent, not
/// stored and not logged anywhere by it. It reads the message against the ministry's 25 bundled scenarios with
/// plain keyword rules. Only when it cannot decide — and only after the person agreed to share data with AI — does
/// the screen offer the server analysis (`POST /api/scam-shield/analyze`, which does not keep the message either).
///
/// 🚨 FAIL-CLOSED WORDING. «No signs found» is never presented as «safe»: the result says what was not seen and
/// that this is not a guarantee. An unknown scam is «not recognised», not «fine».
enum ScamMessageSignal: String, CaseIterable, Equatable, Sendable {
    case otp, urgency, authority, bank, transfer, prize, link, installApp, remoteAccess, qr, investment, relative, delivery, fine

    /// The i18n key of the one-line, plain-language explanation shown to the person.
    var explanationKey: String { "scam.msg.signal." + rawValue }
}

enum ScamMessageOutcome: Equatable, Sendable {
    /// One of the ministry's scenarios fits (`officialNumber`), with what the message showed.
    case matched(number: Int, signals: [ScamMessageSignal], links: [String])
    /// Something looks off but no known scenario fits for sure.
    /// `scenario`: a WEAK match with one of the ministry's scenarios (`ScamScenarioMatcher`), shown under the verdict.
    case unsure(signals: [ScamMessageSignal], links: [String], scenario: Int? = nil)
    /// «Familiar» without a matching scenario (Web: level HIGH from the request rules alone).
    case familiar(signals: [ScamMessageSignal], links: [String])
    /// No familiar scam signs. NOT a guarantee.
    case noSigns(links: [String])

    var signals: [ScamMessageSignal] {
        switch self {
        case .matched(_, let s, _), .unsure(let s, _, _), .familiar(let s, _): return s
        case .noSigns: return []
        }
    }

    var links: [String] {
        switch self {
        case .matched(_, _, let l), .unsure(_, let l, _), .familiar(_, let l), .noSigns(let l): return l
        }
    }
}

enum ScamMessageMatcher {
    /// The server keeps at most this many characters; the app trims the same way before anything else.
    static let maxChars = 4_000

    // MARK: Normalisation

    /// Lower-case, no diacritics (đ → d), punctuation → single spaces. Matching works on this form only.
    static func normalize(_ raw: String) -> String {
        let trimmed = String(raw.prefix(maxChars))
        let folded = trimmed.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "vi"))
            .replacingOccurrences(of: "đ", with: "d")
            .replacingOccurrences(of: "Đ", with: "d")
            .lowercased()
        var out = ""
        out.reserveCapacity(folded.count)
        var lastSpace = true
        for ch in folded {
            if ch.isLetter || ch.isNumber { out.append(ch); lastSpace = false }
            else if !lastSpace { out.append(" "); lastSpace = true }
        }
        return out.trimmingCharacters(in: .whitespaces)
    }

    // MARK: Links

    private static let linkRegex: NSRegularExpression? = try? NSRegularExpression(
        pattern: #"(?i)\b(?:https?://|www\.)[^\s<>"']+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|vn|net|org|xyz|top|info|club|online|site|vip|link|cc|co|me|ly|io|app|shop|store|click|live|icu)\b(?:/[^\s<>"']*)?"#)

    /// The links in a message, in order, without trailing punctuation. Never fetched here.
    static func extractLinks(_ raw: String) -> [String] {
        guard let re = linkRegex else { return [] }
        let text = raw as NSString
        var seen = Set<String>(), out: [String] = []
        for m in re.matches(in: raw, range: NSRange(location: 0, length: text.length)) {
            var s = text.substring(with: m.range)
            while let last = s.last, ".,;:!?)]}\"'»".contains(last) { s.removeLast() }
            let key = s.lowercased()
            if !s.isEmpty, seen.insert(key).inserted { out.append(s) }
            if out.count >= 5 { break }
        }
        return out
    }

    // MARK: Signals

    private static func has(_ tokens: [String], in padded: String) -> Bool {
        tokens.contains { padded.contains(" " + $0 + " ") }
    }

    private static let otpWords = ["otp", "ma xac thuc", "ma xac nhan", "ma bao mat", "ma pin", "mat khau", "ma 6 so"]
    private static let askVerbs = ["cung cap", "gui cho", "doc cho", "nhap ma", "cho minh ma", "gui ma", "xac nhan ma", "cung cap ma", "gui lai", "cho em ma", "cho toi ma"]

    static func signals(in norm: String, hasLink: Bool) -> [ScamMessageSignal] {
        let p = " " + norm + " "
        var out: [ScamMessageSignal] = []
        // An OTP word alone is a bank's own notice («do not share this code»); it counts only when the message ASKS for it.
        if has(otpWords, in: p), has(askVerbs, in: p) || hasLink { out.append(.otp) }
        if has(["khan cap", "ngay lap tuc", "cap bach", "khan truong", "trong vong", "han chot", "24h", "24 gio", "48h", "se bi khoa", "bi khoa", "tam khoa", "qua han", "nhanh chong"], in: p) { out.append(.urgency) }
        if has(["cong an", "vien kiem sat", "toa an", "co quan dieu tra", "lenh bat", "bo cong an", "csgt", "canh sat"], in: p) { out.append(.authority) }
        if has(["ngan hang", "vietcombank", "techcombank", "bidv", "mbbank", "mb bank", "vpbank", "agribank", "vietinbank", "tpbank", "sacombank", "acb", "momo", "zalopay", "the tin dung"], in: p) { out.append(.bank) }
        if has(["chuyen khoan", "chuyen tien", "nap tien", "dat coc", "coc truoc", "nop phi", "dong phi", "nop phat", "thanh toan", "phi van chuyen", "phi ho so"], in: p) { out.append(.transfer) }
        if has(["trung thuong", "qua tang", "nhan thuong", "phan thuong", "giai thuong", "trung giai"], in: p) { out.append(.prize) }
        if hasLink { out.append(.link) }
        if has(["cai dat ung dung", "tai ung dung", "file apk", "apk", "cai app", "tai app", "cai dat phan mem", "tai phan mem"], in: p) { out.append(.installApp) }
        if has(["anydesk", "ultraviewer", "teamviewer", "chia se man hinh", "dieu khien tu xa"], in: p) { out.append(.remoteAccess) }
        if has(["ma qr", "quet ma", "qr code", "qr"], in: p) { out.append(.qr) }
        if has(["dau tu", "chung khoan", "tien so", "forex", "ngoai hoi", "bitcoin", "crypto", "loi nhuan", "sinh loi", "hoa hong", "cong tac vien", "ctv", "nhiem vu"], in: p) { out.append(.investment) }
        if has(["con day", "me day", "bo day", "so moi", "doi so", "nho chuyen", "vay tien"], in: p) { out.append(.relative) }
        if has(["buu pham", "buu kien", "giao hang", "van don", "don hang", "vnpost", "ghn", "ghtk", "shopee", "lazada"], in: p) { out.append(.delivery) }
        if has(["phat nguoi", "vi pham giao thong", "bien so", "nop phat"], in: p) { out.append(.fine) }
        return out
    }

    // MARK: Decision

    /// Web parity (`message/index.ts` + `fusion.ts` + `verdict.ts`, AI off): the verdict comes from `ScamWebEngine` (the Web's
    /// request rules and score bands) and `ScamScenarioMatcher` (the 25 scenarios). The scenario shown is the Web's own match.
    static func analyze(_ raw: String) -> ScamMessageOutcome {
        let links = extractLinks(raw)
        let found = signals(in: normalize(raw), hasLink: !links.isEmpty)
        let scenario = ScamScenarioMatcher.best(raw)
        switch ScamWebEngine.verdict(raw: raw, links: links, scenario: scenario) {
        case .familiar:
            if let scenario { return .matched(number: scenario.number, signals: found, links: links) }
            return .familiar(signals: found, links: links)
        case .suspicious:
            return .unsure(signals: found, links: links, scenario: scenario?.number)
        case .unrecognized:
            return .noSigns(links: links)
        }
    }
}
