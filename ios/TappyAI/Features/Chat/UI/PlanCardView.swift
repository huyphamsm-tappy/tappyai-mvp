import SwiftUI

/// The plan card v2 (owner 29/09) — drawn to the approved sample `docs/design/share-layouts/plan-share.png`
/// ("Quy Nhơn · 3 ngày 2 đêm") at chat width, for ALL FIVE areas, and mirroring Android `TripPlanCard.kt`:
///  - the brand row with «Chia sẻ» (opens the share sheet with the plan image);
///  - the hero: the plan's STORED background image (the area's gradient until the manifest serves it),
///    «TAPPY PLAN», the title, destination · duration · people, the tagline;
///  - «Hành trình»: every day stacked (a non-travel plan is ONE session with times of day), each stop with its
///    time, its STORED stop image, name, description, address and the server's price — or «chưa có giá — hỏi quán»;
///  - «Tổng quan» (only what the server wrote), «Điểm nổi bật» (2×2), the server's tips and cost lines, and
///    «Xem kế hoạch đầy đủ trên Tappy», which publishes the plan and opens its page.
/// What is shown is decided in `PlanCardModel.of` (pure, unit-tested); this file only draws. Fixed dark palette:
/// the card reads the same in both appearances, like the sample.
struct ChatPlanCardView: View {
    let plan: TappyPlan
    /// The `[TAPPY_PLAN]` block verbatim, for «Xem kế hoạch đầy đủ». Nil hides the outcome of publishing.
    var planJSON: String? = nil
    var planShare: PlanSharing? = nil
    var onShare: () -> Void = {}

    @ObservedObject private var images = PlanImageStore.shared
    @State private var publishing = false
    @State private var linkNote: String?

    private var model: PlanCardModel { PlanCardModel.of(plan) }

    var body: some View {
        let m = model
        VStack(alignment: .leading, spacing: 0) {
            brandRow
            hero(m)
            VStack(alignment: .leading, spacing: 18) {
                if !m.days.isEmpty {
                    Text("chat.planV2.itinerary").font(.system(size: 20, weight: .bold)).foregroundStyle(PlanPal.text)
                    ForEach(m.days) { day in dayBlock(day, area: m.area) }
                }
                if !m.overview.isEmpty { overview(m) }
                if !m.highlights.isEmpty { highlights(m) }
                tips
                costLines
                fullPlanCta
                Text("chat.planV2.madeBy").font(.system(size: 12)).foregroundStyle(PlanPal.muted)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16).padding(.vertical, 18)
        }
        .background(PlanPal.ground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(PlanPal.line, lineWidth: 1))
        .padding(.top, 8)
        .environment(\.colorScheme, .dark)
        .onAppear { PlanImageStore.shared.ensureLoaded(api: DIContainer.shared.resolve(APIClient.self)) }
    }

    // MARK: Brand row + hero

    private var brandRow: some View {
        HStack {
            Text(verbatim: "TAPPY").font(.system(size: 18, weight: .black)).kerning(1).foregroundStyle(PlanPal.text)
            Spacer()
            Button(action: onShare) {
                HStack(spacing: 6) {
                    Text("chat.planV2.share").font(.system(size: 13, weight: .medium))
                    Image(systemName: "square.and.arrow.up").font(.system(size: 12))
                }
                .foregroundStyle(PlanPal.text)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .overlay(Capsule().stroke(Color(hex: 0x8FB3FF, alpha: 0.4), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("plan-share")
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
    }

    private func hero(_ m: PlanCardModel) -> some View {
        // The copy sets the hero's height; the image and its veil are the BACKGROUND, so they take that size
        // (a greedy image inside a ZStack would collapse to its ideal size instead).
        VStack(alignment: .leading, spacing: 4) {
            Text("chat.planV2.kicker").font(.system(size: 12, weight: .semibold)).kerning(3).foregroundStyle(PlanPal.kicker)
            Text(m.title).font(.system(size: 26, weight: .heavy)).foregroundStyle(PlanPal.text)
                .accessibilityIdentifier("plan-title")
            ChatFlowLayout(spacing: 14) {
                if let d = m.destination { metaChip("mappin.and.ellipse", d) }
                if let d = m.duration { metaChip("calendar", d) }
                if let p = m.people { metaChip("person.2.fill", peopleText(p)) }
            }
            .padding(.top, 8)
            if let t = m.tagline {
                Text(t).font(.system(size: 14)).foregroundStyle(Color.white.opacity(0.9)).padding(.top, 8)
            }
        }
        .padding(.leading, 18).padding(.trailing, 18).padding(.top, 56).padding(.bottom, 18)
        .frame(maxWidth: .infinity, minHeight: 220, alignment: .bottomLeading)
        .background {
            ZStack {
                PlanImage(key: m.heroKey, area: m.area, manifest: images.manifest, glyph: m.area.emoji, glyphSize: 40, glyphCorner: true)
                LinearGradient(colors: [Color.black.opacity(0.2), PlanPal.ground.opacity(0.8)], startPoint: .top, endPoint: .bottom)
            }
        }
        .clipped()
    }

    private func metaChip(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: symbol).font(.system(size: 14)).foregroundStyle(PlanPal.accent)
            Text(text).font(.system(size: 13, weight: .medium)).foregroundStyle(PlanPal.text)
        }
    }

    private func peopleText(_ n: Int) -> String { String(format: NSLocalizedString("chat.planV2.people", comment: ""), n) }

    // MARK: Days and stops

    private func dayBlock(_ day: PlanCardModel.Day, area: PlanArea) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Circle().fill(PlanPal.badge).frame(width: 36, height: 36)
                    .overlay(Text(String(format: "%02d", day.number)).font(.system(size: 14, weight: .bold)).foregroundStyle(.white))
                VStack(alignment: .leading, spacing: 1) {
                    Text(day.label.isEmpty ? String(format: NSLocalizedString("chat.plan.dayFallback", comment: ""), day.number) : day.label)
                        .font(.system(size: 15, weight: .bold)).foregroundStyle(PlanPal.accent).lineLimit(2)
                        .accessibilityIdentifier("plan-day-\(day.number)")
                    if let t = day.title { Text(t).font(.system(size: 13)).foregroundStyle(PlanPal.muted) }
                }
            }
            ForEach(Array(day.stops.enumerated()), id: \.element.id) { i, stop in
                stopRow(stop, isLast: i == day.stops.count - 1, area: area)
            }
        }
    }

    private func stopRow(_ stop: PlanCardModel.Stop, isLast: Bool, area: PlanArea) -> some View {
        HStack(alignment: .top, spacing: 10) {
            // The time rail: the dot on the day's line, then the line down to the next stop.
            VStack(spacing: 0) {
                Circle().fill(PlanPal.accent).frame(width: 8, height: 8).padding(.top, 5)
                if !isLast { Rectangle().fill(Color(hex: 0x8FB3FF, alpha: 0.4)).frame(width: 1).frame(maxHeight: .infinity).padding(.top, 3) }
            }
            .frame(width: 10)
            Text(stop.time.isEmpty ? "—" : stop.time).font(.system(size: 13, weight: .semibold)).foregroundStyle(PlanPal.text)
                .frame(width: 42, alignment: .leading)
            PlanImage(key: stop.imageKey, area: area, manifest: images.manifest, glyph: stop.emoji, glyphSize: 22)
                .frame(width: 64, height: 64).clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(stop.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(PlanPal.text).lineLimit(2)
                if let d = stop.description { Text(d).font(.system(size: 12)).foregroundStyle(PlanPal.muted).lineLimit(3) }
                if let a = stop.address {
                    HStack(spacing: 3) {
                        Image(systemName: "mappin.and.ellipse").font(.system(size: 11)).foregroundStyle(PlanPal.accent)
                        Text(a).font(.system(size: 12)).foregroundStyle(PlanPal.muted).lineLimit(1)
                    }
                }
                Text(stop.priced ? stop.price : NSLocalizedString("chat.planV2.noPrice", comment: ""))
                    .font(.system(size: 12, weight: stop.priced ? .semibold : .regular))
                    .foregroundStyle(stop.priced ? Color(hex: 0xFFD27A) : PlanPal.muted)
                    .accessibilityIdentifier(stop.priced ? "plan-price" : "plan-no-price")
                if stop.mapsLink != nil || stop.bookingLink != nil {
                    HStack(spacing: 14) {
                        if let url = stop.mapsLink { planLink("mappin.and.ellipse", "chat.plan.map", url) }
                        if let url = stop.bookingLink { planLink("arrow.up.right.square", "chat.plan.bookNow", url) }
                    }
                    .padding(.top, 2)
                }
            }
            .padding(.bottom, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func planLink(_ symbol: String, _ key: String, _ url: URL) -> some View {
        Link(destination: url) {
            HStack(spacing: 3) {
                Image(systemName: symbol).font(.system(size: 11))
                Text(LocalizedStringKey(key)).font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(PlanPal.accent)
        }
    }

    // MARK: Panels

    private func panel<Content: View>(_ titleKey: String, id: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(LocalizedStringKey(titleKey)).font(.system(size: 17, weight: .bold)).foregroundStyle(PlanPal.text)
                .accessibilityIdentifier(id)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PlanPal.panel, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(PlanPal.line, lineWidth: 1))
    }

    private func overview(_ m: PlanCardModel) -> some View {
        panel(m.area == .travel ? "chat.planV2.overviewTrip" : "chat.planV2.overview", id: "plan-overview") {
            ForEach(m.overview) { row in
                let (symbol, label) = Self.overviewParts(row.kind)
                HStack(spacing: 12) {
                    Image(systemName: symbol).font(.system(size: 18)).foregroundStyle(PlanPal.accent).frame(width: 22)
                    Text(LocalizedStringKey(label)).font(.system(size: 13)).foregroundStyle(PlanPal.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(row.kind == .people ? peopleText(Int(row.value) ?? 0) : row.value)
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(PlanPal.text)
                        if let sub = row.sub { Text("(= \(sub))").font(.system(size: 12)).foregroundStyle(PlanPal.muted) }
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
        }
    }

    private static func overviewParts(_ kind: PlanCardModel.OverviewKind) -> (String, String) {
        switch kind {
        case .destination: return ("mappin.circle.fill", "chat.planV2.destination")
        case .duration: return ("calendar", "chat.planV2.duration")
        case .people: return ("person.2.fill", "chat.planV2.peopleLabel")
        case .budget: return ("dollarsign.circle.fill", "chat.planV2.budget")
        }
    }

    private func highlights(_ m: PlanCardModel) -> some View {
        panel("chat.planV2.highlights", id: "plan-highlights") {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(m.highlights) { h in
                    VStack(alignment: .leading, spacing: 6) {
                        PlanImage(key: h.imageKey, area: m.area, manifest: images.manifest, glyph: m.area.emoji, glyphSize: 26)
                            .aspectRatio(4 / 3, contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        Text(h.label).font(.system(size: 13)).foregroundStyle(PlanPal.text).lineLimit(2)
                    }
                }
            }
        }
    }

    /// The server's tips (a stop of this plan, or labelled general advice) — unchanged from v1.
    @ViewBuilder private var tips: some View {
        let list = PlanCardContent.tips(plan)
        if !list.isEmpty {
            panel("chat.plan.localTips", id: "plan-tips") {
                ForEach(Array(list.enumerated()), id: \.offset) { _, tip in
                    Group {
                        if let place = tip.place { Text(verbatim: place + ": ") + Text(verbatim: tip.text) }
                        else { Text("chat.plan.generalTip") + Text(verbatim: " · " + tip.text) }
                    }
                    .font(.system(size: 13)).foregroundStyle(PlanPal.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// The server's cost lines, verbatim (already projected by `PlanPrice`: a non-amount never shows).
    @ViewBuilder private var costLines: some View {
        if let lines = plan.costBreakdown, !lines.isEmpty {
            panel("chat.plan.costBreakdown", id: "plan-costs") {
                ForEach(lines.keys.sorted(), id: \.self) { key in
                    HStack {
                        Text(key).foregroundStyle(PlanPal.muted)
                        Spacer()
                        Text(lines[key] ?? "").foregroundStyle(PlanPal.text)
                    }
                    .font(.system(size: 13))
                }
            }
        }
    }

    // MARK: «Xem kế hoạch đầy đủ trên Tappy»

    /// Publishes THIS block (the share sheet's own path, `POST /api/plans/share`) and opens the returned
    /// `/plan/<id>` page. Needs a signed-in account, exactly like sharing; the reason is shown under the button.
    private var fullPlanCta: some View {
        VStack(spacing: 6) {
            Button {
                Task { await openFullPlan() }
            } label: {
                HStack(spacing: 8) {
                    if publishing { ProgressView().tint(.white) }
                    Text("chat.planV2.fullCta").font(.system(size: 14, weight: .bold)).kerning(0.5)
                    Image(systemName: "arrow.right").font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(PlanPal.cta, in: Capsule())
                .opacity(planJSON == nil || publishing ? 0.6 : 1)
            }
            .buttonStyle(.plain)
            .disabled(planJSON == nil || publishing)
            .accessibilityIdentifier("plan-full-cta")
            if let linkNote {
                Text(LocalizedStringKey(linkNote)).font(.system(size: 12)).foregroundStyle(PlanPal.muted)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("plan-link-note")
            }
        }
    }

    private func openFullPlan() async {
        guard let planJSON, let planShare, !publishing else { return }
        publishing = true; linkNote = nil
        let outcome = await planShare.publish(planJSON: planJSON)
        publishing = false
        switch outcome {
        case .link(_, let url):
            if let link = URL(string: url) { await UIApplication.shared.open(link) }
        case .signInRequired: linkNote = "chat.planV2.linkSignIn"
        default: linkNote = "chat.planV2.linkFailed"
        }
    }
}

/// One image slot: the manifest's URL for the STORED `key`, else the area's gradient with its emoji. Never
/// another picture — no `photo_url` fallback, no key chosen here.
struct PlanImage: View {
    let key: String?
    let area: PlanArea
    let manifest: PlanImageManifest
    let glyph: String
    let glyphSize: CGFloat
    /// The hero's glyph sits in the top-right corner, clear of the title; elsewhere it is centred.
    var glyphCorner = false

    var body: some View {
        let url = manifest.url(for: key)
        ZStack(alignment: glyphCorner ? .topTrailing : .center) {
            area.placeholder
            if let url {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
            } else {
                Text(glyph).font(.system(size: glyphSize)).padding(glyphCorner ? 16 : 0)
                    .accessibilityIdentifier("plan-image-placeholder")
            }
        }
        .clipped()
    }
}

extension PlanArea {
    /// The placeholder gradient of each area — the «ảnh giữ chỗ» drawn under a key the manifest cannot serve.
    var placeholder: LinearGradient {
        let c: [UInt]
        switch self {
        case .travel: c = [0x0EA5E9, 0x1D4ED8, 0x312E81]
        case .food: c = [0xF97316, 0xDB2777, 0x4C1D95]
        case .entertainment: c = [0x8B5CF6, 0xEC4899, 0x1E1B4B]
        case .shopping: c = [0xF59E0B, 0xEF4444, 0x7C2D12]
        case .spa: c = [0x2DD4BF, 0xA855F7, 0x1E1B4B]
        }
        return LinearGradient(colors: c.map { Color(hex: $0) }, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// The sample's colours (dark navy ground, blue→violet accents), fixed so the card reads the same in both themes.
private enum PlanPal {
    static let ground = Color(hex: 0x0B1122)
    static let panel = Color(hex: 0x131B31)
    static let line = Color.white.opacity(0.12)
    static let text = Color.white
    static let muted = Color(hex: 0xA7B0C8)
    static let kicker = Color(hex: 0x8FB3FF)
    static let accent = Color(hex: 0x8FB3FF)
    static let cta = LinearGradient(colors: [Color(hex: 0x3B82F6), Color(hex: 0x8B5CF6)], startPoint: .leading, endPoint: .trailing)
    static let badge = LinearGradient(colors: [Color(hex: 0x3B82F6), Color(hex: 0x8B5CF6)], startPoint: .topLeading, endPoint: .bottomTrailing)
}
