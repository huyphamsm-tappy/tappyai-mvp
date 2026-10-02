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
    case unsure(signals: [ScamMessageSignal], links: [String])
    /// No familiar scam signs. NOT a guarantee.
    case noSigns(links: [String])

    var signals: [ScamMessageSignal] {
        switch self {
        case .matched(_, let s, _), .unsure(let s, _): return s
        case .noSigns: return []
        }
    }

    var links: [String] {
        switch self {
        case .matched(_, _, let l), .unsure(_, let l), .noSigns(let l): return l
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

    // MARK: Scenario rules (the ministry's `officialNumber`)

    /// A rule fits when any `strong` word is present, or one word from `a` AND one from `b` is. `<link>` in `b`
    /// means «the message carries a link». Order = priority: specific rules first, the generic ones last.
    private struct Rule {
        let number: Int
        var strong: [String] = []
        let a: [String]
        let b: [String]
    }

    private static let rules: [Rule] = [
        Rule(number: 20, strong: ["anydesk", "ultraviewer", "teamviewer", "dieu khien tu xa", "chia se man hinh", "file apk"],
             a: ["cai dat ung dung", "tai ung dung", "cai app", "tai app", "cai dat phan mem"],
             b: ["ho tro", "kiem tra", "xac minh", "ngan hang", "cong an", "bao hiem", "nhan vien", "dich vu cong"]),
        Rule(number: 19, a: ["ma qr", "quet ma", "qr code", "qr"],
             b: ["thanh toan", "chuyen tien", "chuyen khoan", "nhan qua", "trung thuong", "buu pham", "buu kien", "dang nhap", "xac thuc", "ngan hang", "phi", "nap tien"]),
        Rule(number: 22, a: ["phat nguoi", "vi pham giao thong", "csgt", "canh sat giao thong"],
             b: ["nop phat", "tra cuu", "<link>", "trong vong", "qua han", "thong bao", "bien so"]),
        Rule(number: 3, a: ["cong an", "vien kiem sat", "toa an", "co quan dieu tra", "lenh bat"],
             b: ["chuyen tien", "chuyen khoan", "xac minh", "tai khoan an toan", "phong toa", "vu an", "dieu tra"]),
        Rule(number: 4, a: ["ngan hang", "nhan vien ngan hang"],
             b: ["otp", "mat khau", "ten dang nhap", "ma xac thuc", "thong tin tai khoan", "so the", "cvv"]),
        Rule(number: 12, a: ["sim", "thue bao"],
             b: ["chuan hoa", "nang cap", "xac thuc", "bi khoa", "ngung hoat dong", "tam khoa", "sinh trac hoc"]),
        Rule(number: 17, a: ["tien dien", "evn", "dien luc", "tien nuoc", "cap nuoc", "cuoc", "viettel", "vinaphone", "mobifone", "no cuoc"],
             b: ["no", "thanh toan", "cat dien", "ngung cung cap", "qua han", "bi khoa", "<link>"]),
        Rule(number: 18, a: ["bhxh", "bao hiem xa hoi", "bao hiem y te", "bhyt", "vneid"],
             b: ["cap nhat", "thong tin", "ho so", "<link>", "xac thuc"]),
        Rule(number: 13, a: ["hoan tien", "hoan thue", "tien hoan"],
             b: ["nhan", "<link>", "thong tin the", "tai khoan", "so the"]),
        Rule(number: 25, a: ["trung tuyen", "nhan viec", "phong van", "tuyen dung"],
             b: ["phi ho so", "phi dao tao", "dong phuc", "dat coc", "nop phi", "dong phi"]),
        Rule(number: 23, a: ["trung thuong", "qua tang", "nhan thuong", "phan thuong", "giai thuong", "trung giai"],
             b: ["phi", "thue", "van chuyen", "nhan qua", "<link>", "lien he", "dong tien", "nop"]),
        Rule(number: 16, a: ["nhom dau tu", "nhom vip", "tham gia nhom", "chuyen gia", "thay giao"],
             b: ["rut lai", "nap them", "loi nhuan", "dau tu"]),
        Rule(number: 14, a: ["cong tac vien", "ctv", "nhiem vu", "lam nhiem vu", "tuyen dung"],
             b: ["hoa hong", "nap tien", "chot don", "thu nhap", "nhan tien", "viec nhe"]),
        Rule(number: 15, a: ["dau tu", "chung khoan", "tien so", "forex", "ngoai hoi", "bitcoin", "crypto"],
             b: ["loi nhuan", "cam ket", "lai suat", "sinh loi", "x2", "nhom"]),
        Rule(number: 24, a: ["lam quen", "nguoi nuoc ngoai", "bac si quan doi", "ket ban"],
             b: ["chuyen tien", "qua tang", "hang ve", "nhan hang ho", "dau tu", "hai quan"]),
        Rule(number: 21, a: ["dat coc", "coc truoc", "ban hang", "ship cod"],
             b: ["chuyen khoan", "gui hang", "coc"]),
        Rule(number: 7, a: ["da chuyen khoan", "bien lai", "anh chuyen khoan"],
             b: ["chua nhan duoc", "gui hang", "gui lai", "hoan"]),
        Rule(number: 10, a: ["co giao", "giao vien", "nha truong", "hoc sinh"],
             b: ["tai nan", "benh vien", "cap cuu", "can tien", "chuyen tien", "vien phi"]),
        Rule(number: 11, a: ["benh vien", "bac si", "cap cuu", "y ta"],
             b: ["nguoi than", "vien phi", "chuyen khoan", "thanh toan", "dat coc", "phau thuat"]),
        Rule(number: 1, a: ["video call", "goi video", "giong noi", "con day", "me day", "bo day", "so moi", "doi so"],
             b: ["chuyen khoan", "chuyen tien", "cap cuu", "vay tien", "nho chuyen", "gap"]),
        Rule(number: 8, a: ["facebook", "zalo", "messenger", "tai khoan"],
             b: ["vay tien", "cho vay", "nap the", "nho chuyen", "giup minh"]),
        Rule(number: 5, a: ["tai khoan", "giao dich", "dang nhap", "bi khoa", "tam khoa", "xac thuc"],
             b: ["ngan hang", "vietcombank", "techcombank", "bidv", "mbbank", "vpbank", "agribank", "vietinbank", "tpbank", "sacombank", "momo", "<link>"]),
        Rule(number: 6, a: ["<link>"],
             b: ["bam vao", "truy cap", "click", "nhan vao", "xem tai", "dang nhap", "cap nhat", "xac thuc", "nhan qua", "bi khoa", "trong vong"])
    ]

    private static func satisfied(_ rule: Rule, padded: String, hasLink: Bool) -> Bool {
        func hit(_ tokens: [String]) -> Bool {
            if tokens.contains("<link>"), hasLink { return true }
            return has(tokens.filter { $0 != "<link>" }, in: padded)
        }
        if has(rule.strong, in: padded) { return true }
        return hit(rule.a) && hit(rule.b)
    }

    // MARK: Decision

    static func analyze(_ raw: String) -> ScamMessageOutcome {
        let links = extractLinks(raw)
        let norm = normalize(raw)
        let padded = " " + norm + " "
        let hasLink = !links.isEmpty
        let found = signals(in: norm, hasLink: hasLink)

        if let rule = rules.first(where: { satisfied($0, padded: padded, hasLink: hasLink) }) {
            return .matched(number: rule.number, signals: found, links: links)
        }
        let s = Set(found)
        func anyOf(_ x: ScamMessageSignal...) -> Bool { x.contains { s.contains($0) } }
        let suspicious =
            anyOf(.otp, .installApp, .remoteAccess, .prize)
            || (s.contains(.link) && anyOf(.urgency, .bank, .authority, .delivery, .fine, .qr, .transfer))
            || (s.contains(.qr) && anyOf(.transfer, .delivery, .bank))
            || (s.contains(.transfer) && anyOf(.urgency, .authority, .relative, .fine))
            || (s.contains(.investment) && anyOf(.transfer, .link))
        return suspicious ? .unsure(signals: found, links: links) : .noSigns(links: links)
    }
}
