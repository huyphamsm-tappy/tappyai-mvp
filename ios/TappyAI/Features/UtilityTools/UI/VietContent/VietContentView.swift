import SwiftUI

/// Viết content — the web `/viet-content` (mockup Sep 28 02_12, Android `VietWriterScreen`): the
/// blue→indigo→violet hero with the reading otter and the three platform marks, then one card per
/// section — topic (with "Thử gợi ý" and the 0/500 counter), platform tiles with the real brand
/// marks, tone pills with icons, length tiles with the sentence-count hint — the gradient
/// "Tạo caption ngay", the error panel and the result. Behaviour is unchanged: one call to
/// `POST /api/viet-content` through `VietContentViewModel`.
struct VietContentView: View {
    @AppStateObject private var vm: VietContentViewModel
    @State private var exampleIdx = 0

    private static let primary = Color(hex: 0x007AFF)
    private static let accent = Color(hex: 0xFF9500)
    private static let accentLight = Color(hex: 0xFFBD66)
    private static let heroGradient = LinearGradient(
        colors: [Color(hex: 0x001833), Color(hex: 0x3730A3), Color(hex: 0x7C3AED)],
        startPoint: .topLeading, endPoint: .bottomTrailing)
    private static let ctaGradient = LinearGradient(
        colors: [Color(hex: 0x007AFF), Color(hex: 0x6366F1), Color(hex: 0x8B5CF6)],
        startPoint: .leading, endPoint: .trailing)

    private static let exampleKeys = (1...5).map { "vietcontent.example.\($0)" }

    private static let toneIcons: [String: (String, Color)] = [
        "funny": ("face.smiling", Color(hex: 0xFBBF24)),
        "emotional": ("heart.fill", Color(hex: 0xF43F5E)),
        "youthful": ("bolt.fill", Color(hex: 0xFF9500)),
        "inspiring": ("leaf.fill", Color(hex: 0x10B981)),
        "professional": ("briefcase.fill", Color(hex: 0xA78BFA)),
    ]
    private static let lengthHintKeys: [String: String] = [
        "short": "vietcontent.length.short.hint",
        "medium": "vietcontent.length.medium.hint",
        "long": "vietcontent.length.long.hint",
    ]

    init(deps: AppDependencies) {
        let service = UtilityToolsService(api: deps.api, consent: deps.aiConsent)
        _vm = AppStateObject(wrappedValue: VietContentViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                hero
                topicCard
                platformCard
                toneCard
                lengthCard
                generateButton
                if let error = vm.error { errorBanner(error) }
                if !vm.caption.isEmpty { resultSection }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle(NSLocalizedString("vietcontent.title", comment: ""))
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Hero

    private var hero: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles").font(.system(size: 14)).foregroundStyle(Color(hex: 0x66ACFF))
                    Text("vietcontent.hero.eyebrow").font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x99C8FF))
                }
                (Text("vietcontent.hero.title1") + Text("\n") + Text("vietcontent.hero.title2Lead") + Text(" ")
                    + Text("vietcontent.hero.accent").foregroundColor(Self.accentLight)
                    + Text(" ✦").foregroundColor(Self.accentLight))
                    .font(.system(size: 22, weight: .black))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Text("vietcontent.hero.body").font(.system(size: 14)).foregroundStyle(.white.opacity(0.8))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            ZStack {
                Image("TappyReading").resizable().scaledToFit()
                Image("BrandFacebook").resizable().frame(width: 28, height: 28)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .rotationEffect(.degrees(6)).offset(x: 42, y: -40)
                Image("BrandTikTok").resizable().frame(width: 28, height: 28)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .rotationEffect(.degrees(-6)).offset(x: 46, y: 30)
                InstagramMark().frame(width: 28, height: 28)
                    .rotationEffect(.degrees(-12)).offset(x: -46, y: -14)
            }
            .frame(width: 112, height: 112)
            .accessibilityHidden(true)
        }
        .padding(20)
        .background(Self.heroGradient)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(.white.opacity(0.1), lineWidth: 1))
        .accessibilityIdentifier("vc-hero")
    }

    // MARK: - Section card

    private func sectionCard<Content: View, Action: View>(
        icon: String, title: LocalizedStringKey, hint: LocalizedStringKey? = nil, required: Bool = false,
        @ViewBuilder action: () -> Action,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                Image(systemName: icon).font(.system(size: 16)).foregroundStyle(Self.primary)
                Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(TappyColor.textPrimary)
                if required { Text("*").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color(hex: 0xF87171)) }
                Spacer(minLength: 8)
                action()
            }
            if let hint {
                Text(hint).font(.system(size: 12)).foregroundStyle(TappyColor.textSecondary)
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
    }

    private func sectionCard<Content: View>(
        icon: String, title: LocalizedStringKey, hint: LocalizedStringKey? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        sectionCard(icon: icon, title: title, hint: hint, action: { EmptyView() }, content: content)
    }

    // MARK: - Topic

    private var topicCard: some View {
        sectionCard(icon: "pencil", title: "vietcontent.topic", required: true, action: {
            Button {
                vm.topic = String(NSLocalizedString(Self.exampleKeys[exampleIdx % Self.exampleKeys.count], comment: "").prefix(500))
                exampleIdx = (exampleIdx + 1) % Self.exampleKeys.count
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "lightbulb.fill").font(.system(size: 13))
                    Text("vietcontent.tryExample").font(.system(size: 14, weight: .medium))
                    Image(systemName: "chevron.right").font(.system(size: 11))
                }
                .foregroundStyle(Self.accentLight)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("vc-try-example")
        }, content: {
            ZStack(alignment: .topLeading) {
                if vm.topic.isEmpty {
                    Text(NSLocalizedString("vietcontent.topicPlaceholder", comment: ""))
                        .font(TappyFont.body)
                        .foregroundStyle(TappyColor.textSecondary.opacity(0.5))
                        .padding(.horizontal, Spacing.md).padding(.vertical, 12)
                }
                TextEditor(text: $vm.topic)
                    .font(TappyFont.body)
                    .foregroundStyle(TappyColor.textPrimary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 90)
                    .padding(.horizontal, Spacing.sm).padding(.vertical, Spacing.xs)
                    .accessibilityIdentifier("vc-topic")
                    .onChange(of: vm.topic) { _ in vm.enforceTopicLimit() }
            }
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            .overlay(RoundedRectangle(cornerRadius: Radius.lg)
                .stroke(vm.isOverLimit ? Color.red : TappyColor.border, lineWidth: 1))
            HStack {
                Text("\(vm.charCount)/\(VietContentViewModel.maxTopicLength)")
                    .font(.system(size: 12))
                    .foregroundStyle(vm.isOverLimit ? .red : TappyColor.textSecondary)
                Spacer()
                if !vm.topic.isEmpty {
                    Button(NSLocalizedString("common.clear", comment: "")) { vm.clear() }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
        })
    }

    // MARK: - Platform / tone / length

    private var platformCard: some View {
        sectionCard(icon: "square.3.layers.3d", title: "vietcontent.platform", hint: "vietcontent.platform.hint") {
            HStack(spacing: 8) {
                ForEach(VietContentViewModel.platforms, id: \.id) { p in
                    let on = vm.platform == p.id
                    Button { vm.platform = p.id } label: {
                        VStack(spacing: 8) {
                            brandMark(p.id).frame(width: 40, height: 40)
                            Text(p.label).font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(TappyColor.textPrimary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .modifier(SelectableTile(on: on, tint: Self.primary, radius: 16))
                        .overlay(alignment: .topTrailing) { if on { checkBadge.padding(8) } }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    .accessibilityIdentifier("vc-platform-\(p.id)")
                }
            }
        }
    }

    @ViewBuilder
    private func brandMark(_ id: String) -> some View {
        switch id {
        case "facebook":
            Image("BrandFacebook").resizable().clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        case "tiktok":
            Image("BrandTikTok").resizable().clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        default:
            InstagramMark()
        }
    }

    private var checkBadge: some View {
        Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
            .frame(width: 20, height: 20).background(Self.primary).clipShape(Circle())
    }

    private var toneCard: some View {
        sectionCard(icon: "wand.and.stars", title: "vietcontent.tone", hint: "vietcontent.tone.hint") {
            ChatFlowLayout(spacing: 8) {
                ForEach(VietContentViewModel.tones, id: \.id) { t in
                    let on = vm.tone == t.id
                    let icon = Self.toneIcons[t.id] ?? ("sparkle", Self.accent)
                    Button { vm.tone = t.id } label: {
                        HStack(spacing: 8) {
                            Image(systemName: icon.0).font(.system(size: 14)).foregroundStyle(icon.1)
                            Text(t.label).font(.system(size: 14, weight: .medium))
                                .foregroundStyle(on ? Self.accentLight : TappyColor.textPrimary)
                        }
                        .padding(.horizontal, 16).frame(minHeight: 40)
                        .background(on ? Self.accent.opacity(0.14) : Color.clear)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(on ? Self.accent : TappyColor.border, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    .accessibilityIdentifier("vc-tone-\(t.id)")
                }
            }
        }
    }

    private var lengthCard: some View {
        sectionCard(icon: "doc.text", title: "vietcontent.length", hint: "vietcontent.length.hint") {
            VStack(spacing: 8) {
                ForEach(VietContentViewModel.lengths, id: \.id) { l in
                    let on = vm.length == l.id
                    Button { vm.length = l.id } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "list.bullet").font(.system(size: 16)).foregroundStyle(Color(hex: 0x66ACFF))
                                .frame(width: 36, height: 36).background(TappyColor.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            VStack(alignment: .leading, spacing: 0) {
                                Text(l.label).font(.system(size: 14, weight: .semibold)).foregroundStyle(TappyColor.textPrimary)
                                Text(LocalizedStringKey(Self.lengthHintKeys[l.id] ?? "")).font(.system(size: 12))
                                    .foregroundStyle(on ? Color(hex: 0x66ACFF) : TappyColor.textSecondary)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .modifier(SelectableTile(on: on, tint: Self.primary, radius: 16))
                        .overlay(alignment: .topTrailing) { if on { checkBadge.padding(8) } }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    .accessibilityIdentifier("vc-length-\(l.id)")
                }
            }
        }
    }

    // MARK: - Generate button

    private var generateButton: some View {
        Button {
            Task { await vm.generate() }
        } label: {
            HStack(spacing: 8) {
                if vm.loading {
                    ProgressView().tint(.white).scaleEffect(0.8)
                    Text(NSLocalizedString("vietcontent.generating", comment: ""))
                } else {
                    Image(systemName: "sparkles")
                    Text(NSLocalizedString("vietcontent.generate", comment: ""))
                    Image(systemName: "arrow.right")
                }
            }
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity).frame(height: 56)
            .background(Self.ctaGradient)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .opacity(vm.canGenerate || vm.loading ? 1 : 0.5)
        }
        .buttonStyle(.plain)
        .disabled(!vm.canGenerate)
        .accessibilityIdentifier("vc-submit")
    }

    // MARK: - Result

    private var resultSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack(spacing: 8) {
                    brandMark(vm.platform).frame(width: 24, height: 24)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(NSLocalizedString("vietcontent.result", comment: ""))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(TappyColor.textSecondary)
                        Text(vm.resultSubtitle)
                            .font(.system(size: 11))
                            .foregroundStyle(TappyColor.textSecondary.opacity(0.8))
                            .accessibilityIdentifier("vc-result-subtitle")
                    }
                    Spacer()
                    Button {
                        vm.copyCaption()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: vm.copiedCaption ? "checkmark" : "doc.on.doc").font(.system(size: 11))
                            Text(NSLocalizedString(vm.copiedCaption ? "vietcontent.copied" : "vietcontent.copy", comment: "")).font(.system(size: 12, weight: .medium))
                        }
                        .foregroundStyle(Self.primary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("vc-copy-caption")
                }
                Text(vm.caption)
                    .font(TappyFont.body)
                    .foregroundStyle(TappyColor.textPrimary)
                    .textSelection(.enabled)
            }
            .padding(Spacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(TappyColor.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(TappyColor.border, lineWidth: 1))

            if !vm.hashtags.isEmpty {
                let tags = vm.hashtags.split(separator: " ").map(String.init)
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text("vietcontent.hashtags").font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(TappyColor.textSecondary)
                    FlowLayout(spacing: Spacing.xs) {
                        ForEach(tags, id: \.self) { tag in
                            Text(tag)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(Self.primary)
                                .padding(.horizontal, Spacing.sm).padding(.vertical, Spacing.xxs)
                                .background(Self.primary.opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
                        }
                    }
                }
                .padding(Spacing.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(TappyColor.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
                .overlay(RoundedRectangle(cornerRadius: Radius.xl).stroke(TappyColor.border, lineWidth: 1))
            }

            HStack(spacing: Spacing.sm) {
                Button {
                    vm.copyAll()
                } label: {
                    Text(LocalizedStringKey(vm.copiedAll ? "vietcontent.copiedAll" : "vietcontent.copyAll"))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .background(Self.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                Button {
                    vm.reset()
                } label: {
                    Text("vietcontent.rewrite")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(TappyColor.textPrimary)
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Error

    private func errorBanner(_ message: String) -> some View {
        Text(message)
            .font(TappyFont.callout)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(Color.red.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    }
}

/// Tile that turns primary-ringed and tinted when chosen (web `SelectedCheck` tiles).
private struct SelectableTile: ViewModifier {
    let on: Bool
    let tint: Color
    let radius: CGFloat

    func body(content: Content) -> some View {
        content
            .background(on ? tint.opacity(0.16) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous)
                .stroke(on ? tint : TappyColor.border, lineWidth: 2))
    }
}

/// Instagram has no bundled logo file (neither on the web): drawn like the web's inline SVG —
/// the gradient rounded square with the camera glyph.
struct InstagramMark: View {
    var body: some View {
        GeometryReader { geo in
            let u = min(geo.size.width, geo.size.height) / 48
            ZStack {
                RoundedRectangle(cornerRadius: 12 * u, style: .continuous)
                    .fill(RadialGradient(
                        colors: [Color(hex: 0xFEDA75), Color(hex: 0xFA7E1E), Color(hex: 0xD62976),
                                 Color(hex: 0x962FBF), Color(hex: 0x4F5BD5)],
                        center: UnitPoint(x: 0.3, y: 1.05), startRadius: 0, endRadius: 58 * u))
                RoundedRectangle(cornerRadius: 8 * u, style: .continuous)
                    .stroke(.white, lineWidth: 3.2 * u).frame(width: 26 * u, height: 26 * u)
                Circle().stroke(.white, lineWidth: 3.2 * u).frame(width: 12.6 * u, height: 12.6 * u)
                Circle().fill(.white).frame(width: 4 * u, height: 4 * u).offset(x: 7.6 * u, y: -7.6 * u)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

// MARK: - Flow Layout for hashtags

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }

        return CGSize(width: maxWidth, height: currentY + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX: CGFloat = bounds.minX
        var currentY: CGFloat = bounds.minY
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX && currentX > bounds.minX {
                currentX = bounds.minX
                currentY += lineHeight + spacing
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
