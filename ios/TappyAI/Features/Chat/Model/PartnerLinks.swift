import Foundation

/// The two link lines the server writes under an answer (web `systemLinkLines`, `lib/ai/consultative/systemLinkRow.ts`):
///   «🔗 Liên kết đối tác: [label](url) · [label](url) …»  — the affiliate partners (Vexere for buses and trains, Agoda for rooms, Lazada for shopping)
///   «📎 Tham khảo thêm: [label](url) · …»                  — every other platform, for reference
/// On the phone they were a run of blue words that wrapped over ten lines (owner UAT 27/11). Here they are taken OUT of the text and returned as
/// links, so the answer can draw one tile per link: partners first, in the order Vexere (a bus or train ticket is the cheapest way and the partner),
/// Agoda, Lazada, then the rest. Nothing is invented: the label and the address are the server's own.
struct PartnerLink: Equatable, Sendable, Identifiable {
    enum Brand: Int, Sendable { case vexere = 0, agoda = 1, lazada = 2, other = 3 }

    let label: String
    let url: String
    let brand: Brand

    var id: String { url }

    /// The label without the platform suffix the server appends («… — 331.049đ/đêm, kiểm tra lúc 18:53 · Agoda» → «… — 331.049đ/đêm, kiểm tra lúc 18:53»).
    var title: String {
        for suffix in [" · Agoda", " · Vexere", " · Lazada"] where label.hasSuffix(suffix) {
            return String(label.dropLast(suffix.count)).trimmingCharacters(in: .whitespaces)
        }
        return label
    }

    var brandName: String? {
        switch brand {
        case .vexere: return "Vexere"
        case .agoda: return "Agoda"
        case .lazada: return "Lazada"
        case .other: return nil
        }
    }
}

enum PartnerLinks {
    /// The partner row and the «more» row of an answer, and the text without them.
    struct Extracted: Equatable, Sendable {
        let text: String
        let partners: [PartnerLink]
        let more: [PartnerLink]
        var isEmpty: Bool { partners.isEmpty && more.isEmpty }
    }

    private static let partnerPrefixes = ["🔗 Liên kết đối tác:", "🔗 Partner links:"]
    private static let morePrefixes = ["📎 Tham khảo thêm:", "📎 More options:"]

    static func extract(_ content: String) -> Extracted {
        guard content.contains("🔗") || content.contains("📎") else { return Extracted(text: content, partners: [], more: []) }
        var kept: [String] = []
        var partners: [PartnerLink] = []
        var more: [PartnerLink] = []
        var inFence = false
        for line in content.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") { inFence.toggle(); kept.append(line); continue }
            if !inFence, let prefix = partnerPrefixes.first(where: { trimmed.hasPrefix($0) }) {
                partners += links(in: String(trimmed.dropFirst(prefix.count)))
                continue
            }
            if !inFence, let prefix = morePrefixes.first(where: { trimmed.hasPrefix($0) }) {
                more += links(in: String(trimmed.dropFirst(prefix.count)))
                continue
            }
            kept.append(line)
        }
        guard !partners.isEmpty || !more.isEmpty else { return Extracted(text: content, partners: [], more: []) }
        // Partners in the owner's order; Swift's sort is not stable, so the original position breaks ties.
        let ordered = partners.enumerated().sorted { a, b in
            a.element.brand.rawValue != b.element.brand.rawValue ? a.element.brand.rawValue < b.element.brand.rawValue : a.offset < b.offset
        }.map(\.element)
        let text = kept.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return Extracted(text: text, partners: ordered, more: more)
    }

    /// Every `[label](https://…)` of a line, in order, with the platform recognised from the label. An address that is not a safe web address is dropped.
    static func links(in line: String) -> [PartnerLink] {
        guard let regex = try? NSRegularExpression(pattern: #"\[([^\]]+)\]\((https?://[^)\s]+)\)"#) else { return [] }
        let ns = line as NSString
        var out: [PartnerLink] = []
        for m in regex.matches(in: line, range: NSRange(location: 0, length: ns.length)) {
            let label = ns.substring(with: m.range(at: 1)).trimmingCharacters(in: .whitespaces)
            let url = ns.substring(with: m.range(at: 2))
            guard !label.isEmpty, safeWebURL(url) != nil else { continue }
            out.append(PartnerLink(label: label, url: url, brand: brand(of: label)))
        }
        return out
    }

    static func brand(of label: String) -> PartnerLink.Brand {
        let l = label.lowercased()
        if l.contains("vexere") { return .vexere }
        if l.contains("agoda") { return .agoda }
        if l.contains("lazada") { return .lazada }
        return .other
    }
}
