import Foundation

/// The one canonical TappyAI share artifact — a port of `src/lib/share/shareArtifact.ts`
/// (and `ShareArtifact.kt` on Android).
///
/// 🔑 SAME INPUT, SAME TEXT AS THE WEB. The brochure format is deliberately identical to the
/// web builder for the same `PlacesLiveView`, so a recommendation shared from iOS and one
/// shared from the web look like they came from the same product — because they did.
///
/// 🚨 WHITELIST, NEVER BLACKLIST. `SharedPlace` names every field that may leave the app and
/// `pickPlace` copies exactly those. Provenance, evidence types, ranks, entity ids, `_tappy_*`
/// and conversation ids have no field to land in.
///
/// 🚨 NO `distanceKm`. It is a fact about the SENDER's position (privacy), so it is not in the
/// whitelist and cannot be shared.
struct ShareArtifact: Identifiable, Equatable, Sendable {
    enum Kind: Equatable, Sendable { case places, plan }

    let kind: Kind
    let title: String
    let subject: String
    let text: String
    /// The brand entry point — the only URL the share guard admits for a recommendation.
    let url: String
    let places: [SharedPlace]

    var id: String { subject + "\u{1F}" + String(text.hashValue) }
}

struct SharedPlace: Equatable, Sendable {
    let name: String
    var category: String? = nil
    var rating: Double? = nil
    var ratingCount: Int? = nil
    var address: String? = nil
    var phone: String? = nil
    var openingHours: String? = nil
    var priceRangeText: String? = nil
    var reasons: [String] = []
    var links: [SharedLink] = []
    var image: String? = nil
}

struct SharedLink: Equatable, Sendable {
    let kind: String
    let url: String
    var platform: String? = nil
}

enum ShareArtifactBuilder {
    /// chat_messages.body CHECK constraint on the web Inbox; text handoffs use the same bound.
    static let inboxMaxBody = 4000

    private static let sharedActionKinds: Set<String> = ["maps", "website", "review", "order", "booking", "ticket", "reservation"]

    private struct Labels {
        let recommends, plan, reviews, why, maps, website, review, order, booking, ticket, reservation, more, footer, people, budget: String
    }

    /// The brochure labels live in the String Catalog (`share.brochure.*`) and are resolved for
    /// the BROCHURE language — the recipient's — not the device locale. Their values are pinned
    /// equal to the web/Android tables by `crossPlatformShare.test.ts`, so the three clients
    /// keep producing the same text.
    private static func labels(_ lang: String) -> Labels {
        let locale = Locale(identifier: lang.hasPrefix("en") ? "en" : "vi")
        func s(_ key: String.LocalizationValue) -> String { String(localized: key, locale: locale) }
        return Labels(
            recommends: s("share.brochure.recommends"), plan: s("share.brochure.plan"),
            reviews: s("share.brochure.reviews"), why: s("share.brochure.why"),
            maps: s("share.brochure.maps"), website: s("share.brochure.website"),
            review: s("share.brochure.review"), order: s("share.brochure.order"),
            booking: s("share.brochure.booking"), ticket: s("share.brochure.ticket"),
            reservation: s("share.brochure.reservation"), more: s("share.brochure.more"),
            footer: s("share.brochure.footer"), people: s("share.brochure.people"),
            budget: s("share.brochure.budget")
        )
    }

    /// Same rule as the web `isSafeHttpsUrl` for what this module needs: https, parseable, has a host.
    static func isSafeHttpsURL(_ raw: String?) -> Bool {
        guard let raw, !raw.isEmpty, let c = URLComponents(string: raw),
              c.scheme?.lowercased() == "https", let host = c.host, !host.isEmpty else { return false }
        return true
    }

    static func pickPlace(_ p: LivePlace) -> SharedPlace {
        var seen = Set<String>()
        let links: [SharedLink] = p.actions.compactMap { a in
            guard sharedActionKinds.contains(a.kind), a.urlKind == "direct",
                  isSafeHttpsURL(a.url), seen.insert(a.url).inserted else { return nil }
            return SharedLink(kind: a.kind, url: a.url, platform: a.platform)
        }
        return SharedPlace(
            name: p.name,
            category: p.categories.first,
            rating: p.rating,
            ratingCount: p.ratingCount,
            address: p.address,
            phone: p.phone,
            openingHours: p.openingHours,
            priceRangeText: p.priceRangeText,
            reasons: p.reasons.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty },
            links: links,
            image: isSafeHttpsURL(p.image) ? p.image : nil
        )
    }

    private static func linkLabel(_ l: Labels, _ link: SharedLink) -> String {
        let base: String
        switch link.kind {
        case "maps": base = l.maps
        case "website": base = l.website
        case "review": base = l.review
        case "order": base = l.order
        case "booking": base = l.booking
        case "ticket": base = l.ticket
        case "reservation": base = l.reservation
        default: base = link.kind
        }
        if let platform = link.platform,
           !genericPlatforms.contains(platform.trimmingCharacters(in: .whitespaces).lowercased()) {
            return "\(base) (\(platform))"
        }
        return base
    }

    /// Platform names that only restate the link kind — "Website (Official Website)" says nothing twice.
    private static let genericPlatforms: Set<String> = ["website", "official website", "maps", "google maps"]

    private static func fmtCount(_ n: Int, _ lang: String) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        f.locale = Locale(identifier: lang.hasPrefix("en") ? "en_US" : "vi_VN")
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }

    /// 4.0 prints as "4", 4.5 as "4.5" — the same as JavaScript's number-to-string.
    private static func fmtRating(_ r: Double) -> String {
        r == r.rounded(.down) ? String(Int(r)) : String(r)
    }

    /// One place as brochure lines — identical layout to the web `placeBlock`.
    static func placeBlock(_ p: SharedPlace, index: Int, lang: String) -> String {
        let l = labels(lang)
        var lines: [String] = ["\(index + 1). \(p.name)"]
        var meta: [String] = []
        if let r = p.rating {
            let count = p.ratingCount.map { " (\(fmtCount($0, lang)) \(l.reviews))" } ?? ""
            meta.append("★ \(fmtRating(r))\(count)")
        }
        if let c = p.category { meta.append(c) }
        if let pr = p.priceRangeText { meta.append(pr) }
        if !meta.isEmpty { lines.append("   " + meta.joined(separator: " · ")) }
        if let a = p.address { lines.append("   📍 \(a)") }
        if let h = p.openingHours { lines.append("   🕐 \(h)") }
        if let ph = p.phone { lines.append("   ☎ \(ph)") }
        if !p.reasons.isEmpty { lines.append("   \(l.why): " + p.reasons.joined(separator: " · ")) }
        for link in p.links { lines.append("   \(linkLabel(l, link)): \(link.url)") }
        return lines.joined(separator: "\n")
    }

    private static func footer(_ l: Labels, _ url: String) -> String {
        var host = url
        if host.hasPrefix("https://") { host.removeFirst("https://".count) }
        else if host.hasPrefix("http://") { host.removeFirst("http://".count) }
        return l.footer.replacingOccurrences(of: "{url}", with: host)
    }

    static func placesBrochure(title: String, places: [SharedPlace], lang: String, url: String) -> String {
        let l = labels(lang)
        var parts: [String] = ["\(l.recommends): \(title)", ""]
        for (i, p) in places.enumerated() { parts.append(placeBlock(p, index: i, lang: lang)); parts.append("") }
        parts.append(footer(l, url))
        return parts.joined(separator: "\n")
    }

    /// The plan brochure, from the plan STRUCTURE.
    ///
    /// The iOS `TappyPlan` model carries days → activities (time, title, description, cost); the
    /// header uses the turn's subject because the model has no `title`. Nothing model-authored
    /// is copied verbatim beyond those structured fields.
    static func planBrochure(_ plan: TappyPlan, title: String, lang: String, url: String) -> String {
        let l = labels(lang)
        var parts: [String] = ["\(l.plan): \(title)", ""]
        for (i, day) in plan.days.enumerated() {
            parts.append(day.title ?? (lang.hasPrefix("en") ? "Day \(day.day ?? i + 1)" : "Ngày \(day.day ?? i + 1)"))
            for it in day.activities ?? [] {
                let head = [it.time, it.title].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
                if !head.isEmpty { parts.append("  " + head) }
                if let d = it.description, !d.isEmpty { parts.append("     \(d)") }
                if let c = it.cost, !c.isEmpty { parts.append("     \(c)") }
            }
            parts.append("")
        }
        parts.append(footer(l, url))
        return parts.joined(separator: "\n")
    }

    /// Fit within `max` without ever cutting a URL — same strategy as the web `compactBrochure`.
    static func compactBrochure(title: String, places: [SharedPlace], lang: String, url: String, max: Int = inboxMaxBody) -> String {
        let full = placesBrochure(title: title, places: places, lang: lang, url: url)
        if full.count <= max { return full }
        let l = labels(lang)
        let head = "\(l.recommends): \(title)"
        let foot = footer(l, url)
        var kept = places.count
        while kept > 0 {
            let shown = Array(places.prefix(kept))
            let more = places.count - kept
            var body: [String] = [head, ""]
            for (i, p) in shown.enumerated() { body.append(placeBlock(p, index: i, lang: lang) + "\n") }
            if more > 0 { body.append(l.more.replacingOccurrences(of: "{n}", with: String(more)) + "\n") }
            body.append(foot)
            let joined = body.joined(separator: "\n")
            if joined.count <= max { return joined }
            kept -= 1
        }
        guard let p = places.first else { return [head, "", foot].joined(separator: "\n") }
        let slim = SharedPlace(name: p.name, category: p.category, rating: p.rating, ratingCount: p.ratingCount,
                               address: p.address, links: Array(p.links.filter { $0.kind == "maps" }.prefix(1)))
        let more = places.count - 1
        let body = [head, "", placeBlock(slim, index: 0, lang: lang), "",
                    more > 0 ? l.more.replacingOccurrences(of: "{n}", with: String(more)) : "", foot].joined(separator: "\n")
        if body.count <= max { return body }
        return String([head, "", "1. \(p.name)", "", foot].joined(separator: "\n").prefix(max))
    }

    static func buildPlacesArtifact(_ view: PlacesLiveView, title: String, lang: String) -> ShareArtifact {
        let url = TappyShare.canonicalOrigin
        let places = view.items.map(pickPlace)
        let l = labels(lang)
        return ShareArtifact(kind: .places, title: title, subject: "\(l.recommends): \(title)",
                             text: placesBrochure(title: title, places: places, lang: lang, url: url), url: url, places: places)
    }

    static func buildPlanArtifact(_ plan: TappyPlan, title: String, lang: String) -> ShareArtifact {
        let url = TappyShare.canonicalOrigin
        let l = labels(lang)
        return ShareArtifact(kind: .plan, title: title, subject: "\(l.plan): \(title)",
                             text: planBrochure(plan, title: title, lang: lang, url: url), url: url, places: [])
    }

    /// Prose → share text (same rules as the web `proseForShare`): emphasis and headings go, a
    /// markdown link keeps its destination as `label: url` when it passes the guard, images go.
    static func proseForShare(_ text: String) -> String {
        var s = text
        s = s.replacingOccurrences(of: #"!\[[^\]]*\]\([^)]*\)"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\*\*(.*?)\*\*"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\*(.*?)\*"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"#{1,3}\s"#, with: "", options: .regularExpression)
        if let re = try? NSRegularExpression(pattern: #"\[([^\]]+)\]\(([^)\s]+)\)"#) {
            let ns = s as NSString
            var out = ""; var last = 0
            for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
                out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
                let label = ns.substring(with: m.range(at: 1)), url = ns.substring(with: m.range(at: 2))
                out += isSafeHttpsURL(url) ? "\(label): \(url)" : label
                last = m.range.location + m.range.length
            }
            out += ns.substring(from: last)
            s = out
        }
        if let re = try? NSRegularExpression(pattern: #"(^|\s)(https?://\S+)"#) {
            let ns = s as NSString
            var out = ""; var last = 0
            for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
                out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
                let pre = ns.substring(with: m.range(at: 1)), url = ns.substring(with: m.range(at: 2))
                out += isSafeHttpsURL(url) ? pre + url : pre
                last = m.range.location + m.range.length
            }
            out += ns.substring(from: last)
            s = out
        }
        s = s.replacingOccurrences(of: #"[ \t]+\n"#, with: "\n", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// A turn with no card and no plan: the prose, under the TappyAI header. Strictly more than before.
    static func buildProseArtifact(subject: String, prose: String) -> ShareArtifact {
        let url = TappyShare.canonicalOrigin
        return ShareArtifact(kind: .places, title: subject, subject: "TappyAI: \(subject)",
                             text: "TappyAI\n\n\(proseForShare(prose))\n\n— TappyAI · tappyai.com", url: url, places: [])
    }

    /// The Inbox/handoff-safe body: same content, bounded, URLs intact.
    static func inboxBody(_ a: ShareArtifact, lang: String) -> String {
        if a.kind == .places, !a.places.isEmpty {
            return compactBrochure(title: a.title, places: a.places, lang: lang, url: a.url)
        }
        if a.text.count <= inboxMaxBody { return a.text }
        let lines = a.text.components(separatedBy: "\n")
        let foot = lines.last ?? ""
        var out: [String] = []
        var len = foot.count + 1
        for line in lines.dropLast() {
            if len + line.count + 1 > inboxMaxBody { break }
            out.append(line); len += line.count + 1
        }
        return (out + [foot]).joined(separator: "\n")
    }
}
