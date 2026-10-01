import SwiftUI

/// The consult ASK turn — ask card v2 (Huy 30/09, `docs/design/ask-card/ask-card-mockup.png`, R23 +
/// R23.1; rules in `AskCardModel`, a 1:1 port of the web): the search-otter header (title per area),
/// numbered questions with their sub-line, IMAGE tiles for the "type" question (several picks; image
/// by KEY through the R22 manifest, area placeholder until it serves one), ICON tiles for who / when /
/// where / budget (one pick, tap again to clear), the «Hoặc nói thêm ý khác…» box with its send
/// button, and «Tìm cho tôi» — always on; once sent the card locks.
///
/// The block and the message sent are UNCHANGED in shape: one text reply, questions joined " · ",
/// a multi-choice question's picks joined ", ", free text last. Dark in both appearances (spec).
struct AskCardView: View {
    let questions: [AskQuestion]
    let onSend: (String) -> Void

    @State private var chosen: [String: Set<String>] = [:]
    @State private var free = ""
    @State private var sent = false
    @ObservedObject private var images = PlanImageStore.shared

    private var views: [AskQuestionView] { AskCardModel.viewOf(questions) }
    private var area: AskArea { AskCardModel.areaOf(questions) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            VStack(alignment: .leading, spacing: 16) {
                ForEach(Array(views.enumerated()), id: \.element.id) { i, v in
                    if i > 0 { AskPal.line.frame(height: 1) }
                    question(v)
                }
                freeText
            }
            .padding(12)
            .background(AskPal.panel, in: RoundedRectangle(cornerRadius: 18))
            .padding(10)
            sendButton
                .padding(.horizontal, 10).padding(.bottom, 12)
        }
        .background(LinearGradient(colors: [Color(hex: 0x15213D), AskPal.ground], startPoint: .top, endPoint: .bottom))
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(AskPal.line, lineWidth: 1))
        .padding(.top, 12)
        .environment(\.colorScheme, .dark)
        .onAppear { PlanImageStore.shared.ensureLoaded(api: DIContainer.shared.resolve(APIClient.self)) }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 8) {
            Image("TappySearch").resizable().scaledToFit().frame(width: 72, height: 76).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(LocalizedStringKey("ask.v2.title." + area.rawValue)).font(.system(size: 19, weight: .bold)).foregroundStyle(.white)
                Text(LocalizedStringKey("ask.v2.sub." + area.rawValue)).font(.system(size: 13)).foregroundStyle(AskPal.sub)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, 10).padding(.trailing, 16).padding(.top, 12)
    }

    // MARK: Questions

    private func question(_ v: AskQuestionView) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Circle().fill(Color(hex: 0x2563EB)).frame(width: 34, height: 34)
                    .overlay(Text("\(v.number)").font(.system(size: 16, weight: .bold)).foregroundStyle(.white))
                VStack(alignment: .leading, spacing: 1) {
                    Text(v.title).font(.system(size: 16, weight: .semibold)).foregroundStyle(.white)
                    if let sub = Self.subtitleKey(v.kind) {
                        Text(LocalizedStringKey(sub)).font(.system(size: 13)).foregroundStyle(AskPal.muted)
                    }
                }
            }
            if v.kind == .type {
                // R23.1 §7: 3 options → 3 columns; 4 → 2×2 on a phone; 2 → 2 columns.
                let cols = v.options.count == 3 ? 3 : 2
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: cols), spacing: 8) {
                    ForEach(v.options, id: \.label) { o in
                        imageTile(o, on: picked(v, o), compact: cols == 3) { toggle(v, o) }
                    }
                }
            } else {
                // R23.1 §7: 4 options → icon above the label; 2–3 → icon beside the label, one row.
                let stacked = v.options.count >= 4
                HStack(spacing: 8) {
                    ForEach(v.options, id: \.label) { o in
                        iconTile(o, on: picked(v, o), stacked: stacked) { toggle(v, o) }
                    }
                }
            }
        }
    }

    private func picked(_ v: AskQuestionView, _ o: AskOptionView) -> Bool { chosen[v.id]?.contains(o.label) ?? false }

    private func toggle(_ v: AskQuestionView, _ o: AskOptionView) {
        guard !sent else { return }
        chosen = AskCardModel.toggle(chosen, v, o.label)
    }

    private func imageTile(_ o: AskOptionView, on: Bool, compact: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Color.clear
                .aspectRatio(compact ? 1 : 1.35, contentMode: .fit)
                .overlay {
                    ZStack {
                        Self.tint(area)
                        if let url = images.manifest.url(for: o.imageKey) {
                            AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                        } else {
                            Image(systemName: Self.symbol(o.icon)).font(.system(size: 30)).foregroundStyle(.white.opacity(0.55))
                                .padding(.bottom, 26)
                        }
                    }
                }
                .overlay(alignment: .bottom) {
                    HStack(spacing: 8) {
                        Image(systemName: Self.symbol(o.icon)).font(.system(size: 15)).foregroundStyle(Color(hex: 0x93C5FD))
                        Text(Self.noWrapHyphen(o.label)).font(.system(size: compact ? 12.5 : 14, weight: .medium))
                            .foregroundStyle(.white).lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 8)
                    .background(LinearGradient(colors: [AskPal.ground.opacity(0), AskPal.ground.opacity(0.9)], startPoint: .top, endPoint: .bottom))
                }
                .overlay(alignment: .topTrailing) { if on { check.padding(6) } }
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(on ? AskPal.on : AskPal.line, lineWidth: on ? 2 : 1))
        }
        .buttonStyle(.plain)
        .disabled(sent)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityIdentifier("ask-option")
    }

    private func iconTile(_ o: AskOptionView, on: Bool, stacked: Bool, action: @escaping () -> Void) -> some View {
        let iconTint = on ? Color(hex: 0x60A5FA) : Color(hex: 0xB9C6E4)
        let textColor = on ? Color(hex: 0x93C5FD) : Color.white
        return Button(action: action) {
            Group {
                if stacked {
                    VStack(spacing: 6) {
                        Image(systemName: Self.symbol(o.icon)).font(.system(size: 22)).foregroundStyle(iconTint)
                        Text(Self.noWrapHyphen(o.label)).font(.system(size: 12.5)).foregroundStyle(textColor)
                            .multilineTextAlignment(.center).lineLimit(2)
                    }
                    .padding(.horizontal, 4).padding(.vertical, 12)
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: Self.symbol(o.icon)).font(.system(size: 20)).foregroundStyle(iconTint)
                        Text(Self.noWrapHyphen(o.label)).font(.system(size: 13.5)).foregroundStyle(textColor).lineLimit(2)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 14)
                }
            }
            .frame(maxWidth: .infinity, minHeight: stacked ? 84 : 56)
            .background(on ? AskPal.onFill : AskPal.tile)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(on ? AskPal.on : AskPal.line, lineWidth: on ? 2 : 1))
            // On the corner (outside the clip) so a narrow tile's label is never drawn under the tick.
            .overlay(alignment: .topTrailing) { if on { check.scaleEffect(0.82).offset(x: 6, y: -6) } }
        }
        .buttonStyle(.plain)
        .disabled(sent)
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityIdentifier("ask-option")
    }

    private var check: some View {
        Circle().fill(AskPal.on).frame(width: 22, height: 22)
            .overlay(Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white))
    }

    // MARK: Free text + send

    private var freeText: some View {
        HStack(spacing: 10) {
            Image(systemName: "bubble.left").font(.system(size: 19)).foregroundStyle(Color(hex: 0x60A5FA))
            ZStack(alignment: .topLeading) {
                if free.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ask.v2.freeHint").font(.system(size: 15)).foregroundStyle(AskPal.muted)
                        Text(LocalizedStringKey("ask.v2.example." + area.rawValue)).font(.system(size: 12))
                            .foregroundStyle(AskPal.muted.opacity(0.7))
                    }
                    .allowsHitTesting(false)
                }
                TextField("", text: $free)
                    .font(.system(size: 15)).foregroundStyle(.white).tint(AskPal.on)
                    .disabled(sent)
                    .accessibilityIdentifier("ask-free-text")
            }
            .padding(.vertical, 8)
            Button(action: send) {
                Circle().fill(Color(hex: 0x2563EB)).frame(width: 46, height: 46)
                    .overlay(Image(systemName: "paperplane.fill").font(.system(size: 18)).foregroundStyle(.white))
            }
            .buttonStyle(.plain)
            .disabled(sent)
            .opacity(sent ? 0.45 : 1)
            .accessibilityLabel(Text("ask.v2.cta"))
            .accessibilityIdentifier("ask-free-send")
        }
        .padding(.leading, 12).padding(.trailing, 6).padding(.vertical, 6)
        .background(Color(hex: 0x111B31), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(AskPal.line, lineWidth: 1))
    }

    private var sendButton: some View {
        Button(action: send) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles").font(.system(size: 18, weight: .semibold))
                Text(LocalizedStringKey(sent ? "ask.v2.sending" : "ask.v2.cta")).font(.system(size: 17, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(LinearGradient(colors: [Color(hex: 0x2563EB), Color(hex: 0x3B82F6), Color(hex: 0x60A5FA)],
                                       startPoint: .leading, endPoint: .trailing),
                        in: RoundedRectangle(cornerRadius: 16))
            .opacity(sent ? 0.6 : 1)
        }
        .buttonStyle(.plain)
        .disabled(sent)
        .accessibilityIdentifier("ask-send")
    }

    private func send() {
        guard !sent else { return }
        sent = true
        onSend(AskCardModel.sendText(views, chosen: chosen, free: free))
    }

    // MARK: Mapping

    static func subtitleKey(_ kind: AskKind) -> String? {
        switch kind {
        case .type: return "ask.v2.sub.type"
        case .party: return "ask.v2.sub.party"
        case .time: return "ask.v2.sub.time"
        case .budget: return "ask.v2.sub.budget"
        case .other: return nil
        }
    }

    /// Placeholder tint per area (web `ASK_AREA_TINT`).
    static func tint(_ area: AskArea) -> LinearGradient {
        let c: (UInt, UInt)
        switch area {
        case .entertainment: c = (0x6D28D9, 0x1E1B4B)
        case .food: c = (0xC2410C, 0x431407)
        case .shopping: c = (0x0E7490, 0x082F49)
        case .travel: c = (0x0369A1, 0x0C4A6E)
        case .spa: c = (0xBE185D, 0x500724)
        case .main: c = (0x1D4ED8, 0x172554)
        }
        return LinearGradient(colors: [Color(hex: c.0), Color(hex: c.1)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// SF Symbols of the same meaning as the web's lucide glyphs.
    static func symbol(_ icon: AskIcon) -> String {
        switch icon {
        case .music: return "music.note"
        case .film: return "film"
        case .martini: return "wineglass"
        case .circleDot: return "circle.circle"
        case .coffee: return "cup.and.saucer"
        case .flame: return "flame"
        case .soup: return "takeoutbag.and.cup.and.straw"
        case .utensils: return "fork.knife"
        case .flower: return "leaf"
        case .waves: return "water.waves"
        case .mountain: return "mountain.2"
        case .shoppingBag: return "bag"
        case .mic: return "music.mic"
        case .help: return "questionmark.circle"
        case .sparkles: return "sparkles"
        case .user: return "person.fill"
        case .users: return "person.2.fill"
        case .usersRound: return "person.3.fill"
        case .calendar: return "calendar"
        case .moon: return "moon.fill"
        case .sun: return "sun.max"
        case .wallet: return "wallet.pass"
        case .mapPin: return "mappin.and.ellipse"
        case .plane: return "airplane"
        case .bus: return "bus"
        case .car: return "car"
        case .bike: return "scooter"
        case .store: return "storefront"
        }
    }

    /// A range like «3-5» / «700k-1,5tr» never wraps at its hyphen (display only).
    static func noWrapHyphen(_ s: String) -> String { s.replacingOccurrences(of: "-", with: "\u{2011}") }
}

private enum AskPal {
    static let ground = Color(hex: 0x0B1122)
    static let panel = Color(hex: 0x0F182C)
    static let line = Color.white.opacity(0.12)
    static let sub = Color(hex: 0x8FB3FF)
    static let muted = Color(hex: 0xA7B0C8)
    static let tile = Color(hex: 0x16213A)
    static let on = Color(hex: 0x3B82F6)
    static let onFill = Color(hex: 0x3B82F6, alpha: 0.2)
}
