import SwiftUI

// Smart Tools — the registry and THE card (web `src/lib/tools/registry.ts` + `SmartToolCard.tsx`,
// Android `SmartTools.kt`). One list, one card, two sizes: `full` on the catalogue page, `compact`
// on Home. Every entry opens a screen iOS already has; nothing is recreated. Like Android there is
// no "Gợi ý" tool — Home's "Gợi ý dành cho bạn" already opens recommendations.

enum SmartToolId: String, CaseIterable { case scan, translate, currency, split, safety, together, fortune, captions }

enum SmartToolGroup: String, CaseIterable {
    case daily, discover, fun
    var titleKey: String { "smartTools.group." + rawValue }
}

enum SmartToolHue { case blue, indigo, emerald, amber, rose, violet, pink }

struct SmartTool: Identifiable {
    let id: SmartToolId
    let symbol: String
    let hue: SmartToolHue
    /// Mascot pose asset (web `SMART_TOOL_SKINS`).
    let mascot: String
    let group: SmartToolGroup
    var auth = false

    var titleKey: String { "smartTools.tool." + id.rawValue }
    var descKey: String { "smartTools.tool." + id.rawValue + ".desc" }

    var destination: HomeDestination {
        switch id {
        case .scan: return .scan
        case .translate: return .translate
        case .currency: return .currency
        case .split: return .splitBill
        case .safety: return .scamShield
        case .together: return .groupDining
        case .fortune: return .fortune
        case .captions: return .vietContent
        }
    }

    /// The registry, in the web's order (minus `suggest`, as on Android): safety FIRST, then scan
    /// (Web registry.ts:75-77, «Phase 7 closeout 8J: Cảnh báo lừa đảo comes before Quét»).
    static let all: [SmartTool] = [
        SmartTool(id: .safety, symbol: "checkmark.shield.fill", hue: .blue, mascot: "TappyRecommendation", group: .daily),
        SmartTool(id: .scan, symbol: "doc.text.viewfinder", hue: .blue, mascot: "TappySearching", group: .daily),
        SmartTool(id: .translate, symbol: "character.bubble", hue: .indigo, mascot: "TappySpeaking", group: .daily),
        SmartTool(id: .currency, symbol: "arrow.left.arrow.right", hue: .emerald, mascot: "TappyDeals", group: .daily),
        SmartTool(id: .split, symbol: "divide", hue: .amber, mascot: "TappyWelcome", group: .daily),
        SmartTool(id: .together, symbol: "person.3.fill", hue: .rose, mascot: "TappyFood", group: .discover, auth: true),
        SmartTool(id: .fortune, symbol: "sparkles", hue: .violet, mascot: "TappyThinking", group: .fun),
        SmartTool(id: .captions, symbol: "pencil.line", hue: .pink, mascot: "TappyPhone", group: .fun),
    ]

    /// The five Home previews: the Web `home: true` subset, in registry order (Web registry.ts:70-75
    /// `homeSmartTools()`; HomeV3.tsx:748-754 renders exactly those five). Together, Fortune and
    /// Captions are `home: false` (registry.ts:80,84,85) and stay reachable from the catalogue (`all`).
    static let home: [SmartTool] = all.filter { $0.group == .daily }
}

/// The web's `.v3-toolcard[data-hue]` stops, per appearance.
struct SmartToolPalette {
    let a: Color, b: Color, badge: Color
    var badgeFg: Color = .white

    static func of(_ hue: SmartToolHue, dark: Bool) -> SmartToolPalette {
        func p(_ a: UInt, _ b: UInt, _ badge: UInt, fg: UInt? = nil) -> SmartToolPalette {
            SmartToolPalette(a: Color(hex: a), b: Color(hex: b), badge: Color(hex: badge), badgeFg: fg.map { Color(hex: $0) } ?? .white)
        }
        if dark {
            switch hue {
            case .blue: return p(0x2563E6, 0x0A1D52, 0x3B82F6)
            case .indigo: return p(0x5B46DD, 0x16163E, 0x7C6CF6)
            case .emerald: return p(0x0F8F6C, 0x062B2C, 0x14B58A)
            case .amber: return p(0xB9661C, 0x35200F, 0xF59E0B, fg: 0x1F1200)
            case .rose: return p(0xAD385C, 0x371424, 0xF0648B)
            case .violet: return p(0x6C40E3, 0x1D1444, 0xA07CFF)
            case .pink: return p(0xCF3A76, 0x46152F, 0xFF5C8A)
            }
        }
        switch hue {
        case .blue: return p(0xE3EEFF, 0xBFD5FF, 0x2563EB)
        case .indigo: return p(0xE8E4FF, 0xCCC4FA, 0x5B4FD9)
        case .emerald: return p(0xDAF6EC, 0xB3E9D4, 0x0E8F6A)
        case .amber: return p(0xFFEFD8, 0xFBD9A8, 0xC2620A)
        case .rose: return p(0xFFE2E9, 0xFBC2CF, 0xC92F58)
        case .violet: return p(0xEEE5FF, 0xD7C5FF, 0x7442D6)
        case .pink: return p(0xFFDFEE, 0xFFBCD6, 0xD63A75)
        }
    }
}

/// One tool: glyph badge top-left, mascot top-right, title + description under the mascot's feet,
/// bare chevron bottom-right. The whole card is the button.
struct SmartToolCard: View {
    let tool: SmartTool
    var compact = false
    let onTap: () -> Void

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let dark = scheme == .dark
        let palette = SmartToolPalette.of(tool.hue, dark: dark)
        let fg = dark ? Color.white : HomeV3.onSurface
        let fgMuted = dark ? Color.white.opacity(0.82) : HomeV3.onSurfaceVariant
        let badge: CGFloat = compact ? 40 : 48
        let mascot: CGFloat = compact ? 68 : 88
        let pad: CGFloat = compact ? 14 : 16
        Button(action: onTap) {
            ZStack(alignment: .topTrailing) {
                Image(tool.mascot).resizable().scaledToFit()
                    .frame(width: mascot, height: mascot)
                    .padding(compact ? 6 : 8)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    RoundedRectangle(cornerRadius: compact ? 12 : 14).fill(palette.badge)
                        .frame(width: badge, height: badge)
                        .overlay(Image(systemName: tool.symbol).font(.system(size: compact ? 17 : 21, weight: .semibold))
                            .foregroundStyle(palette.badgeFg))
                    Spacer().frame(height: max(12, mascot - badge + 4))
                    Text(LocalizedStringKey(tool.titleKey))
                        .font(.system(size: compact ? 15 : 18, weight: .bold)).foregroundStyle(fg)
                        .lineLimit(2).padding(.trailing, compact ? 24 : 28)
                    Text(LocalizedStringKey(tool.descKey))
                        .font(.system(size: compact ? 12 : 13)).foregroundStyle(fgMuted)
                        .lineLimit(3).padding(.top, compact ? 4 : 6).padding(.trailing, compact ? 24 : 28)
                    if tool.auth {
                        Label { Text("smartTools.authHint") } icon: { Image(systemName: "lock.fill") }
                            .font(.system(size: 11, weight: .medium)).foregroundStyle(fgMuted).padding(.top, 6)
                    }
                    Spacer(minLength: 0)
                }
                .padding(pad)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, minHeight: compact ? 150 : 180, alignment: .topLeading)
            .overlay(alignment: .bottomTrailing) {
                Image(systemName: "chevron.right").font(.system(size: compact ? 14 : 16, weight: .semibold))
                    .foregroundStyle(fg).padding(pad)
            }
            .background(
                ZStack {
                    LinearGradient(colors: [palette.a, palette.b], startPoint: .topLeading, endPoint: .bottomTrailing)
                    if dark {
                        LinearGradient(stops: [.init(color: .clear, location: 0.42), .init(color: .black.opacity(0.32), location: 1)],
                                       startPoint: .top, endPoint: .bottom)
                    }
                    RadialGradient(colors: [Color.white.opacity(dark ? 0.13 : 0.45), .clear],
                                   center: UnitPoint(x: 0.88, y: 0.08), startRadius: 0, endRadius: 140)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18)
                .stroke(dark ? Color.white.opacity(0.10) : Color(hex: 0x0F172A, alpha: 0.08), lineWidth: 1))
            .shadow(color: .black.opacity(0.25), radius: 4, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("tool-" + tool.id.rawValue)
    }
}

/// Two-column grid of cards.
struct SmartToolGrid: View {
    let tools: [SmartTool]
    var compact = false
    let onOpen: (SmartTool) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(tools) { tool in
                SmartToolCard(tool: tool, compact: compact) { onOpen(tool) }
            }
        }
    }
}

/// The catalogue (web `/tools`, Android `SmartToolsScreen`): every tool, grouped.
struct SmartToolsView: View {
    @AppEnvironmentState private var router: AppRouter

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("smartTools.blurb").font(.system(size: 15)).foregroundStyle(HomeV3.onSurfaceVariant)
                // Web ToolsView.tsx:84-99 `data-tools-cta`: a link back to Home, the assistant that «does more».
                Button { router.popToRoot(on: .home) } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "lightbulb.fill").foregroundStyle(Color.orange)
                        Text("smartTools.cta").font(.system(size: 13, weight: .medium)).foregroundStyle(HomeV3.onSurface)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(HomeV3.onSurfaceVariant.opacity(0.25), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("smart-tools-cta")
                ForEach(SmartToolGroup.allCases, id: \.self) { group in
                    let tools = SmartTool.all.filter { $0.group == group }
                    if !tools.isEmpty {
                        Text(LocalizedStringKey(group.titleKey))
                            .font(.system(size: 20, weight: .bold)).foregroundStyle(HomeV3.onSurface)
                        SmartToolGrid(tools: tools) { router.push($0.destination, on: .home) }
                    }
                }
            }
            .padding(16)
        }
        .background(HomeV3.background.ignoresSafeArea())
        .navigationTitle(Text("home.v3.smartTools.title"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
