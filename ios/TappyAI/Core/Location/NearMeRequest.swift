import Foundation

/// Does this message ask for what is near the person ("quán phở gần tôi", "coffee near me")? Port of the web's `isNearMeRequest`
/// (`src/lib/location/currentLocation.ts`, Round 42, allowlist approved by Huy 13/10/2026).
///
/// A near-me question must go out with a NEW device fix, never an older one: a position kept from this morning, or from a trip three days ago, would
/// put the wrong district in the answer. The list is fixed on purpose. It does NOT contain "gần đây" (also "lately"), "gần chợ …", "xung quanh <place>"
/// or "gần nhà". "quanh tôi / xung quanh tôi / quanh mình" are matched with their tone marks only: without them "quanh minh" is also "quanh Minh Khai"
/// (a place) and "quanh toi" is also "quanh tối" (around tonight).
enum NearMeRequest {
    private static let plain = try? NSRegularExpression(
        pattern: #"(?:^|[^a-z0-9])(?:gan toi|gan minh|gan cho toi|gan cho minh|quanh day|xung quanh day|near me|nearby|around here|gan tui|near here|around me)(?![a-z0-9])"#)
    private static let marked = try? NSRegularExpression(
        pattern: #"(?:^|[^\p{L}\p{N}])(?:quanh tôi|xung quanh tôi|quanh mình)(?![\p{L}\p{N}])"#)

    static func matches(_ text: String) -> Bool {
        guard !text.isEmpty else { return false }
        let folded = text.lowercased().replacingOccurrences(of: "đ", with: "d").folding(options: .diacriticInsensitive, locale: nil)
        if hit(plain, in: folded) { return true }
        return hit(marked, in: text.precomposedStringWithCanonicalMapping.lowercased())
    }

    private static func hit(_ regex: NSRegularExpression?, in s: String) -> Bool {
        guard let regex else { return false }
        return regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }
}
