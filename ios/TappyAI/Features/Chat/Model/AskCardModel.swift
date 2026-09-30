import Foundation

/// Ask card v2 (Huy 30/09, `docs/design/ask-card/README.md` R23 + R23.1) — the pure half, a 1:1 port of
/// the web's `src/lib/structuredContent/askCardModel.ts` (Android `AskCardModel.kt` is the same port),
/// so all clients draw the same card from the same unchanged `[TAPPY_ASK]` (`{id, q, options[≤4]}`):
/// the area (header), each question's kind (sub-line, one or many), each option's icon and — for the
/// type question — its image KEY (looked up in the R22 manifest). The message sent keeps its shape.
enum AskArea: String { case food, shopping, travel, entertainment, spa, main }

enum AskKind {
    case type, party, time, budget, other
    /// Only the type question takes several picks.
    var multi: Bool { self == .type }
}

/// Web lucide name → this enum; the view maps it to an SF Symbol.
enum AskIcon: String {
    case music, film, martini, circleDot, coffee, flame, soup, utensils, flower, waves, mountain, shoppingBag, mic, help, sparkles
    case user, users, usersRound, calendar, moon, sun, wallet
    case mapPin, plane, bus, car, bike, store
}

struct AskOptionView: Equatable {
    let label: String
    let icon: AskIcon
    let imageKey: String?
}

struct AskQuestionView: Equatable, Identifiable {
    let id: String
    let number: Int
    let title: String
    let kind: AskKind
    let options: [AskOptionView]
}

enum AskCardModel {
    /// Lower case, no marks (web `fold`); đ → d. ASCII-only afterwards, so `\b` is safe.
    static func fold(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d")
            .lowercased()
    }

    /// Lower case WITH marks (web `lower`) — for words that collide once folded (rạp/rap, lẩu/lâu, đồ/đỏ, chợ/cho).
    static func lower(_ s: String) -> String { s.precomposedStringWithCanonicalMapping.lowercased() }

    private static func has(_ pattern: String, _ s: String) -> Bool {
        s.range(of: pattern, options: .regularExpression) != nil
    }

    /// The area of the ask turn from the question ids the router emits (web `askAreaOf`).
    static func areaOf(_ questions: [AskQuestion]) -> AskArea {
        let ids = Set(questions.map(\.id))
        if ids.contains("dish") || ids.contains("mode") { return .food }
        if ids.contains("service") || ids.contains("special") { return .spa }
        if ids.contains("activity") || ids.contains("vibe") || ids.contains("artist") { return .entertainment }
        if ids.contains("date") || ids.contains("origin") || ids.contains("transport") { return .travel }
        if ids.contains("line") || ids.contains("must") || ids.contains("condition") || ids.contains("purpose") { return .shopping }
        if let style = questions.first(where: { $0.id == "style" }) {
            let spa = #"\b(?:massage|toan than|vai gay|da nong|nail|son gel|dinh da|dap bot|mong|toc|cat|uon|nhuom|phuc hoi|goi)\b"#
            return style.options.contains { has(spa, fold($0)) } ? .spa : .travel
        }
        // A hotel ask that already knows the dates carries only party / budget per night.
        if questions.contains(where: { q in
            has(#"\b(?:moi dem|may dem)\b"#, fold(q.q))
                || (q.id == "party" && q.options.contains { has(#"\b(?:gia dinh|nhom ban)\b"#, fold($0)) })
        }) { return .travel }
        return .main
    }

    private static let typeIds: Set<String> = ["style", "type", "kind", "activity", "genre", "artist", "cuisine", "category", "loai", "mon", "product", "dish", "service"]
    private static let partyIds: Set<String> = ["party", "people", "group", "pax"]
    private static let timeIds: Set<String> = ["time", "when", "date", "day"]
    private static let budgetIds: Set<String> = ["budget", "price"]

    /// Web `askStepKind`: `id` first, then the words of `q`.
    static func kindOf(_ q: AskQuestion) -> AskKind {
        if typeIds.contains(q.id) { return .type }
        if partyIds.contains(q.id) { return .party }
        if timeIds.contains(q.id) { return .time }
        if budgetIds.contains(q.id) { return .budget }
        let t = fold(q.q)
        if has(#"\b(?:lam gi|loai|the loai|kieu|mon|thich gi|hoat dong|ca si)\b"#, t) { return .type }
        if has(#"\b(?:may nguoi|voi ai|bao nhieu nguoi)\b"#, t) { return .party }
        if has(#"\b(?:luc nao|khi nao|thoi diem|hom nao|ngay|gio)\b"#, t) { return .time }
        if has(#"\b(?:bao nhieu|gia|ngan sach|tam)\b"#, t) { return .budget }
        return .other
    }

    /// Web `TILE_ROWS` — the first row whose folded (`f`) or marked (`r`) words match wins.
    private struct TileRow { let f: String?; let r: String?; let key: String?; let icon: AskIcon }

    // Marked-word lookarounds use a letter class so "ăn" never matches inside "phăn"/"ănh".
    private static let L = #"\p{L}"#
    private static let tileRows: [TileRow] = [
        TileRow(f: #"\bkaraoke\b"#, r: nil, key: "diem-karaoke", icon: .music),
        TileRow(f: #"\b(?:phim|cinema)\b"#, r: "rạp", key: "diem-rap-phim", icon: .film),
        TileRow(f: #"\b(?:bar|pub|bia|beer|cocktail)\b"#, r: nil, key: "diem-bar-rooftop", icon: .martini),
        TileRow(f: #"\b(?:bida|billiard)\b"#, r: nil, key: "diem-bida", icon: .circleDot),
        TileRow(f: #"\bbowling\b"#, r: nil, key: "diem-bowling", icon: .circleDot),
        TileRow(f: #"\b(?:ca phe|cafe|coffee)\b"#, r: "trà", key: "diem-cafe", icon: .coffee),
        TileRow(f: #"\b(?:nuong|bbq)\b"#, r: "lẩu", key: "diem-lau-nuong", icon: .flame),
        TileRow(f: #"\bsushi\b"#, r: "nhật|hàn", key: "diem-mon-nhat-han", icon: .soup),
        TileRow(f: #"\b(?:mon viet|am thuc|nha hang|quan an)\b"#, r: "phở|bún|cơm|(?<!\(L))(?:ăn|món)(?!\(L))", key: "diem-quan-an", icon: .utensils),
        TileRow(f: #"\b(?:nail|mong)\b"#, r: nil, key: "diem-nail", icon: .flower),
        TileRow(f: #"\b(?:spa|massage|goi dau|goi)\b"#, r: nil, key: "diem-spa", icon: .flower),
        TileRow(f: #"\bbien\b"#, r: nil, key: "diem-bien", icon: .waves),
        TileRow(f: #"\b(?:nui|trekking|cam trai)\b"#, r: nil, key: "diem-nui", icon: .mountain),
        TileRow(f: #"\b(?:mua sam|shop|shopping|mall)\b"#, r: "chợ|(?<!\(L))đồ(?!\(L))", key: "diem-mua-sam", icon: .shoppingBag),
        TileRow(f: #"\b(?:nhac|concert|show|live|pop|rap|indie|acoustic)\b"#, r: nil, key: "diem-am-nhac", icon: .mic),
        TileRow(f: #"\b(?:chua biet|khong quan trong|gi cung duoc|tuy)\b"#, r: nil, key: nil, icon: .help),
    ]

    private static func tileRow(_ option: String) -> TileRow? {
        let f = fold(option), r = lower(option)
        return tileRows.first { row in
            (row.f.map { has($0, f) } ?? false) || (row.r.map { has($0, r) } ?? false)
        }
    }

    /// Web `askTileKey`: a type tile's image key; nil = no image ("not sure" options); unmatched →
    /// the same-name key `diem-<slug>`.
    static func tileKeyOf(_ option: String) -> String? {
        if let row = tileRow(option) { return row.key }
        var slug = fold(option).replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
        slug = slug.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        slug = String(slug.prefix(40))
        return "diem-" + (slug.isEmpty ? "khac" : slug)
    }

    /// Web `askIconOf`.
    static func iconOf(_ option: String, kind: AskKind, question: String = "") -> AskIcon {
        let f = fold(option)
        func m(_ re: String) -> Bool { has(re, f) }
        switch kind {
        case .type:
            return tileRow(option)?.icon ?? .sparkles
        case .party:
            if m(#"(?:^|\D)3(?:\D|$)|\bnhom\b|\bdong\b|\bgia dinh\b"#) { return .usersRound }
            if m(#"(?:^|\D)2(?:\D|$)"#) { return .users }
            return .user
        case .time:
            if m(#"\b(?:tuan|thang|ngay|chua chot|\d+n\d*d?)\b"#) { return .calendar }
            if m(#"\b(?:toi|dem)\b"#) { return .moon }
            if m(#"\b(?:sang|trua|chieu)\b"#) { return .sun }
            return .calendar
        case .budget:
            return .wallet
        case .other:
            // A place question («Khu vực nào?», «Xuất phát từ đâu?») pins every option.
            if has(#"\b(?:khu vuc|o dau|tu dau|xuat phat|quan nao)\b"#, fold(question)) { return .mapPin }
            if m(#"\b(?:gan|quan|tp|ha noi|da nang|noi khac|khu vuc)\b"#) { return .mapPin }
            if m(#"\bmay bay\b"#) { return .plane }
            if m(#"\b(?:xe khach|limousine|tau)\b"#) { return .bus }
            if m(#"\b(?:xe rieng|o to|tu lai)\b"#) { return .car }
            if m(#"\b(?:giao|ship)\b"#) { return .bike }
            if m(#"\btai quan\b"#) { return .store }
            return .sparkles
        }
    }

    static func viewOf(_ questions: [AskQuestion]) -> [AskQuestionView] {
        questions.enumerated().map { i, q in
            let kind = kindOf(q)
            return AskQuestionView(
                id: q.id, number: i + 1, title: q.q, kind: kind,
                options: q.options.map { o in
                    AskOptionView(label: o, icon: iconOf(o, kind: kind, question: q.q), imageKey: kind == .type ? tileKeyOf(o) : nil)
                })
        }
    }

    /// A tap on `label` in question `v`: tapping a pick clears it; the type question adds, the others replace.
    static func toggle(_ chosen: [String: Set<String>], _ v: AskQuestionView, _ label: String) -> [String: Set<String>] {
        var out = chosen
        var cur = chosen[v.id] ?? []
        if cur.contains(label) { cur.remove(label) } else if v.kind.multi { cur.insert(label) } else { cur = [label] }
        out[v.id] = cur
        return out
    }

    /// Sent when nothing is chosen and nothing typed — R23.1: «Tìm cho tôi» still searches.
    static let emptyAnswer = "Tìm cho tôi"

    /// Each question's picks in the card's option order (", " inside a multi-choice question), in
    /// question order, joined " · ", free text last.
    static func composeAnswer(_ views: [AskQuestionView], chosen: [String: Set<String>], free: String = "") -> String {
        let parts: [String] = views.compactMap { v in
            let picked = v.options.map(\.label).filter { chosen[v.id]?.contains($0) ?? false }
            return picked.isEmpty ? nil : picked.joined(separator: ", ")
        }
        let extra = free.trimmingCharacters(in: .whitespacesAndNewlines)
        return (parts + (extra.isEmpty ? [] : [extra])).joined(separator: " · ")
    }

    /// Web `askSendText`: `composeAnswer`, or `emptyAnswer` when both are empty.
    static func sendText(_ views: [AskQuestionView], chosen: [String: Set<String>], free: String = "") -> String {
        let s = composeAnswer(views, chosen: chosen, free: free)
        return s.isEmpty ? emptyAnswer : s
    }
}
