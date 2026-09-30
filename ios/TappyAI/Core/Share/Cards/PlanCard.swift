import SwiftUI

/// The PLAN share image — port of web `src/lib/share/planCard.ts` and Android `PlanCard.kt`
/// (sample #7, "TAPPY PLAN"): navy ground, the plan's own photo as the BACKGROUND of the whole top
/// (or a gradient band when there is none), the eyebrow + title + real counts, a numbered day
/// timeline, "Điểm nổi bật" (≥ 2 photos), the overview box, the blue→violet CTA pill carrying the
/// plan link, and "Được tạo bởi TappyAI".
///
/// 🚨 THE IMAGE RULE (same as `/plan/<id>`): a photo appears ONLY when the stop carries a canonical
/// place photo (`isPlanPhotoUrl`). No photo → no image frame, no stock art.
struct PlanCardData: Equatable, Sendable {
    struct Item: Equatable, Sendable {
        var time: String?
        var name: String
        var description: String?
        var address: String?
        var photoUrl: String?
    }
    struct Day: Equatable, Sendable {
        var label: String
        var items: [Item]
    }
    var title: String
    var days: [Day]
    var people: Int?
    var budgetTotal: String?
    var summary: String?

    static let maxSummary = 160
    static let cardDays = 3
    static let cardStops = 4

    private static let photoHosts = ["googleusercontent.com", "gstatic.com", "ggpht.com"]

    /// Web `isPlanPhotoUrl`: https on a Google place-photo host — never TappyAI's own media bucket.
    static func isPlanPhotoUrl(_ value: String?) -> Bool {
        guard let value, value.hasPrefix("https://"), let host = URL(string: value)?.host?.lowercased() else { return false }
        return photoHosts.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    init(title: String, days: [Day], people: Int? = nil, budgetTotal: String? = nil, summary: String? = nil) {
        self.title = title; self.days = days; self.people = people
        self.budgetTotal = budgetTotal; self.summary = summary
    }

    /// The snapshot of a chat plan, with the web snapshot's bounds and photo rule. Nil when it has no stop.
    init?(plan: TappyPlan) {
        let days: [Day] = plan.days.prefix(10).enumerated().compactMap { (i, d) -> Day? in
            let items = d.items.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }.prefix(12).map { it in
                Item(time: it.time.trimmingCharacters(in: .whitespaces).isEmpty ? nil : it.time.trimmingCharacters(in: .whitespaces),
                     name: it.name.trimmingCharacters(in: .whitespaces),
                     description: it.description?.trimmingCharacters(in: .whitespaces),
                     address: it.address?.trimmingCharacters(in: .whitespaces),
                     photoUrl: Self.isPlanPhotoUrl(it.photoUrl) ? it.photoUrl : nil)
            }
            if items.isEmpty { return nil }
            let label = d.label.trimmingCharacters(in: .whitespaces)
            return Day(label: label.isEmpty ? String(i + 1) : label, items: Array(items))
        }
        guard !days.isEmpty, !plan.title.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        title = plan.title.trimmingCharacters(in: .whitespaces)
        self.days = days
        people = plan.people.flatMap { (1...999).contains($0) ? $0 : nil }
        budgetTotal = plan.budgetTotal?.trimmingCharacters(in: .whitespaces).nonEmpty
        if let s = plan.shareText?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty, s.count <= Self.maxSummary,
           s.range(of: "https?://", options: [.regularExpression, .caseInsensitive]) == nil {
            summary = s
        } else {
            summary = nil
        }
    }

    /// Distinct stop photos in order (≤ 4); the hero is the first — web `brochureOf`.
    var highlights: [(name: String, photo: String)] {
        var seen = Set<String>()
        var out: [(name: String, photo: String)] = []
        for it in days.flatMap(\.items) {
            guard let ph = it.photoUrl, seen.insert(ph).inserted else { continue }
            out.append((name: it.name, photo: ph))
            if out.count == 4 { break }
        }
        return out
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}

/// Plan labels in the viewer's language (web `planBrochureStrings`).
struct PlanCardStrings: Sendable {
    let eyebrow, itinerary, overview, highlights, days, stops, people, budget, cta, madeBy, madeByLine, durationLabel, partyLabel: String

    static func of(_ lang: String) -> PlanCardStrings {
        func s(_ k: String) -> String { CardCopy.string("share.plan.\(k)", lang: lang) }
        return PlanCardStrings(eyebrow: s("eyebrow"), itinerary: s("itinerary"), overview: s("overview"), highlights: s("highlights"),
                               days: s("days"), stops: s("stops"), people: s("people"), budget: s("budget"), cta: s("cta"),
                               madeBy: s("madeBy"), madeByLine: s("madeByLine"), durationLabel: s("duration"), partyLabel: s("party"))
    }

    /// Web `fill`: "{n} ngày"; English singulars for 1.
    static func fill(_ template: String, _ n: Int) -> String {
        var s = template.replacingOccurrences(of: "{n}", with: String(n))
        if n == 1 {
            for (plural, singular) in [("days", "day"), ("stops", "stop"), ("people", "person")] {
                s = s.replacingOccurrences(of: "\\b\(plural)\\b", with: singular, options: .regularExpression)
            }
        }
        return s
    }
}

struct PlanCardView: View {
    let data: PlanCardData
    let url: String
    let strings: PlanCardStrings
    let images: [String: UIImage]

    private let pad: CGFloat = 60

    var body: some View {
        let highlights = data.highlights
        let heroImage = highlights.first.flatMap { images[$0.photo] }
        let dayCount = data.days.count
        let stopCount = data.days.reduce(0) { $0 + $1.items.count }
        VStack(alignment: .leading, spacing: 0) {
            hero(heroImage: heroImage, dayCount: dayCount, stopCount: stopCount)
            itinerary
            if highlights.count >= 2 { highlightsGrid(highlights) }
            overview(dayCount: dayCount, stopCount: stopCount)
            cta
        }
        .frame(width: 1080, alignment: .topLeading)
        .background(
            LinearGradient(stops: [.init(color: CardDark.groundDeep, location: 0), .init(color: CardDark.ground, location: 0.4),
                                   .init(color: CardDark.groundEnd, location: 1)], startPoint: .top, endPoint: .bottom))
        .environment(\.colorScheme, .dark)
    }

    // MARK: Hero

    private func hero(heroImage: UIImage?, dayCount: Int, stopCount: Int) -> some View {
        let meta = [PlanCardStrings.fill(strings.days, dayCount), PlanCardStrings.fill(strings.stops, stopCount),
                    data.people.map { PlanCardStrings.fill(strings.people, $0) }]
            .compactMap { $0 }.joined(separator: "   ·   ")
        let height: CGFloat = heroImage != nil ? 1000 : 760
        return ZStack(alignment: .topLeading) {
            if let heroImage {
                Image(uiImage: heroImage).resizable().scaledToFill().frame(width: 1080, height: height).clipped()
                LinearGradient(colors: [Color(hex: 0x070A12, alpha: 0.70), .clear], startPoint: .top, endPoint: .bottom)
                    .frame(width: 1080, height: 260)
                LinearGradient(stops: [.init(color: Color(hex: 0x070A12, alpha: 0.10), location: 0),
                                       .init(color: Color(hex: 0x070A12, alpha: 0.45), location: 0.55),
                                       .init(color: CardDark.groundDeep, location: 1)], startPoint: .top, endPoint: .bottom)
                    .frame(width: 1080, height: height)
                LinearGradient(stops: [.init(color: Color(hex: 0x070A12, alpha: 0.60), location: 0),
                                       .init(color: Color(hex: 0x070A12, alpha: 0.15), location: 0.6),
                                       .init(color: .clear, location: 1)], startPoint: .leading, endPoint: .trailing)
                    .frame(width: 1080, height: height)
            } else {
                LinearGradient(colors: [Color(hex: 0x3B82F6, alpha: 0.22), Color(hex: 0x8B5CF6, alpha: 0.22)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                    .frame(width: 1080, height: height - 120).offset(y: 120)
            }
            // Top bar: the lockup ("Tappy" white, "AI" blue).
            HStack(spacing: 16) {
                Image("OtterMark").resizable().scaledToFill().frame(width: 60, height: 60).clipShape(Circle())
                (Text("Tappy").foregroundColor(CardDark.text) + Text("AI").foregroundColor(Color(hex: 0x3391FF)))
                    .font(.system(size: 40, weight: .heavy))
            }
            .offset(x: pad, y: 32)

            // Eyebrow, title, counts, summary — bottom-aligned in the hero.
            VStack(alignment: .leading, spacing: 20) {
                Text(strings.eyebrow.uppercased().map(String.init).joined(separator: " "))
                    .font(.system(size: 28, weight: .bold)).foregroundStyle(CardDark.eyebrow)
                Text(data.title).font(.system(size: 76, weight: .heavy)).foregroundStyle(CardDark.text)
                    .lineLimit(2).minimumScaleFactor(0.6)
                Text(meta).font(.system(size: 30, weight: .semibold)).foregroundStyle(CardDark.text)
                    .lineLimit(1).minimumScaleFactor(0.6)
                if let summary = data.summary {
                    Text(summary).font(.system(size: 28)).foregroundStyle(CardDark.muted).lineLimit(2)
                }
            }
            .shadow(color: heroImage != nil ? .black.opacity(0.55) : .clear, radius: 8, x: 0, y: 3)
            .frame(width: 1080 - pad * 2, alignment: .leading)
            .frame(height: height - 56, alignment: .bottomLeading)
            .offset(x: pad)
        }
        .frame(width: 1080, height: height, alignment: .topLeading)
        .clipped()
    }

    // MARK: Itinerary

    private var itinerary: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(strings.itinerary).font(.system(size: 48, weight: .heavy)).foregroundStyle(CardDark.text)
                .padding(.top, 60).padding(.bottom, 24)
            ForEach(Array(data.days.prefix(PlanCardData.cardDays).enumerated()), id: \.offset) { di, day in
                dayBlock(di, day)
            }
            if data.days.count > PlanCardData.cardDays {
                Text("+" + PlanCardStrings.fill(strings.days, data.days.count - PlanCardData.cardDays))
                    .font(.system(size: 26, weight: .semibold)).foregroundStyle(CardDark.eyebrow).padding(.top, 8)
            }
        }
        .padding(.horizontal, pad)
        .frame(width: 1080, alignment: .leading)
    }

    private func dayBlock(_ di: Int, _ day: PlanCardData.Day) -> some View {
        let items = Array(day.items.prefix(PlanCardData.cardStops))
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 24) {
                Text(String(format: "%02d", di + 1)).font(.system(size: 30, weight: .heavy)).foregroundStyle(.white)
                    .frame(width: 72, height: 72)
                    .background(Circle().fill(LinearGradient(colors: [CardDark.accentFrom, CardDark.accentTo], startPoint: .topLeading, endPoint: .bottomTrailing)))
                Text(day.label).font(.system(size: 34, weight: .bold)).foregroundStyle(CardDark.eyebrow).lineLimit(1)
            }
            .frame(height: 96, alignment: .leading)
            ForEach(Array(items.enumerated()), id: \.offset) { _, it in stop(it) }
            if day.items.count > PlanCardData.cardStops {
                Text("+" + PlanCardStrings.fill(strings.stops, day.items.count - PlanCardData.cardStops))
                    .font(.system(size: 24, weight: .medium)).foregroundStyle(CardDark.faint).padding(.leading, 96)
            }
            Spacer().frame(height: 24)
        }
    }

    private func stop(_ it: PlanCardData.Item) -> some View {
        HStack(alignment: .top, spacing: 0) {
            ZStack(alignment: .top) {
                Rectangle().fill(Color(hex: 0x3B82F6, alpha: 0.6)).frame(width: 3)
                Circle().fill(CardDark.accentFrom).frame(width: 16, height: 16).offset(y: 8)
            }
            .frame(width: 72, height: 128)
            Text(it.time ?? "").font(.system(size: 28, weight: .bold)).foregroundStyle(CardDark.text)
                .lineLimit(1).minimumScaleFactor(0.6)
                .frame(width: 120, alignment: .leading).padding(.leading, 24)
            if let photo = it.photoUrl, let img = images[photo] {
                CardPhoto(image: img, width: 150, height: 100, radius: 16) { Color.clear }.padding(.trailing, 20)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(it.name).font(.system(size: 30, weight: .bold)).foregroundStyle(CardDark.text).lineLimit(1)
                if let d = it.description, !d.isEmpty {
                    Text(d).font(.system(size: 23)).foregroundStyle(CardDark.muted).lineLimit(1)
                }
                if let a = it.address, !a.isEmpty {
                    HStack(spacing: 8) {
                        CardPin(size: 22, color: CardDark.pin)
                        Text(a).font(.system(size: 22)).foregroundStyle(CardDark.faint).lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .frame(height: 128, alignment: .top)
    }

    // MARK: Highlights / overview / CTA

    private func highlightsGrid(_ all: [(name: String, photo: String)]) -> some View {
        let tiles = Array(all.prefix(4))
        let tw = (1080 - pad * 2 - 24) / 2
        return VStack(alignment: .leading, spacing: 24) {
            Text(strings.highlights).font(.system(size: 40, weight: .heavy)).foregroundStyle(CardDark.text).padding(.top, 40)
            // Plain rows, not a lazy grid: `ImageRenderer` has no viewport for lazy containers to fill.
            ForEach(Array(stride(from: 0, to: tiles.count, by: 2)), id: \.self) { start in
                HStack(alignment: .top, spacing: 24) {
                    ForEach(Array(tiles[start..<min(start + 2, tiles.count)].enumerated()), id: \.offset) { _, h in
                        VStack(alignment: .leading, spacing: 10) {
                            CardPhoto(image: images[h.photo], width: tw, height: 280, radius: 24) { CardDark.panel }
                            Text(h.name).font(.system(size: 26, weight: .semibold)).foregroundStyle(CardDark.text)
                                .lineLimit(1).frame(width: tw, alignment: .leading)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, pad).frame(width: 1080, alignment: .leading)
    }

    private func overview(dayCount: Int, stopCount: Int) -> some View {
        var rows: [(String, String)] = [(strings.durationLabel,
                                          "\(PlanCardStrings.fill(strings.days, dayCount)) · \(PlanCardStrings.fill(strings.stops, stopCount))")]
        if let p = data.people { rows.append((strings.partyLabel, PlanCardStrings.fill(strings.people, p))) }
        if let b = data.budgetTotal { rows.append((strings.budget, b)) }
        return VStack(alignment: .leading, spacing: 0) {
            Text(strings.overview).font(.system(size: 34, weight: .heavy)).foregroundStyle(CardDark.text).padding(.bottom, 28)
            ForEach(Array(rows.prefix(3).enumerated()), id: \.offset) { _, r in
                HStack(alignment: .top) {
                    Text(r.0).font(.system(size: 26, weight: .medium)).foregroundStyle(CardDark.muted).frame(width: 440, alignment: .leading)
                    Text(r.1).font(.system(size: 26, weight: .bold)).foregroundStyle(CardDark.text).lineLimit(2)
                    Spacer(minLength: 0)
                }
                .frame(height: 64, alignment: .top)
            }
        }
        .padding(36)
        .frame(width: 1080 - pad * 2, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(CardDark.panel))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(CardDark.panelBorder, lineWidth: 2))
        .padding(.horizontal, pad).padding(.top, 30)
    }

    private var cta: some View {
        VStack(spacing: 0) {
            Text("\(strings.cta.uppercased())  →").font(.system(size: 32, weight: .heavy)).foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.5)
                .frame(width: 1080 - pad * 2 - 80, height: 100)
                .background(Capsule().fill(LinearGradient(colors: [CardDark.accentFrom, CardDark.accentTo], startPoint: .leading, endPoint: .trailing)))
                .padding(.top, 40)
            Text(url.replacingOccurrences(of: "^https?://", with: "", options: .regularExpression))
                .font(.system(size: 26, weight: .semibold)).foregroundStyle(CardDark.eyebrow).lineLimit(1).minimumScaleFactor(0.5)
                .padding(.top, 44).padding(.horizontal, pad)
            Text("\(strings.madeBy) TappyAI").font(.system(size: 26, weight: .medium)).foregroundStyle(CardDark.text).padding(.top, 36)
            Text(strings.madeByLine).font(.system(size: 22)).foregroundStyle(CardDark.faint).padding(.top, 8)
            Spacer().frame(height: 60)
        }
        .frame(width: 1080)
    }
}
