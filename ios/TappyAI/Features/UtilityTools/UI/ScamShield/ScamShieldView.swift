import SwiftUI
import UIKit

/// Scam Shield — B09 parity with the web `/scam-shield` page.
///
/// The URL check only. The web also accepts a QR image (`/api/scam-shield/qr`); that needs camera
/// and photo-library plumbing of its own and is deliberately absent rather than half-built.
///
/// 🚨 FAIL-CLOSED PRESENTATION. A check that did not complete is shown as a check that did not
/// complete. `inconclusive` — and any level this build does not recognise — is drawn in neutral
/// slate with the "unresolved" glyph, never the green shield. That distinction is the whole reason
/// the engine reports an INCONCLUSIVE level rather than guessing.
struct ScamShieldView: View {
    @AppStateObject private var vm: ScamShieldViewModel
    @State private var evidenceOpen = false
    @State private var section: Pane = .check
    @State private var confirmOpenLink: URL?
    private let knowledge = ScamKnowledge.load()

    private enum Pane { case check, message, qr, library }
    /// The library is hidden when the bundled dataset is unreadable (never an empty tab).
    private var hasLibrary: Bool { !knowledge.scenarios.isEmpty }

    init(deps: AppDependencies) {
        let service = UtilityToolsService(api: deps.api, consent: deps.aiConsent)
        _vm = AppStateObject(wrappedValue: ScamShieldViewModel(service: service))
    }

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text(NSLocalizedString("scamShield.subtitle", comment: ""))
                    .font(TappyFont.body)
                    .foregroundColor(TappyColor.textSecondary)

                // Fixed, whatever tab is open: where to call if the money has already gone.
                ScamEmergencyCard()

                Picker("", selection: $section) {
                    Text("scam.pane.link").tag(Pane.check)
                    Text("scam.pane.message").tag(Pane.message)
                    Text("scam.pane.qr").tag(Pane.qr)
                    if hasLibrary { Text("scam.pane.library").tag(Pane.library) }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("scam-tabs")

                switch section {
                case .library where hasLibrary:
                    ScamLibraryView(knowledge: knowledge)
                case .message:
                    ScamMessageView(vm: vm, knowledge: knowledge) { link in
                        UIApplication.shared.dismissKeyboard()
                        vm.url = link
                        section = .check
                        Task { await vm.check() }
                    }
                case .qr:
                    ScamQRView(vm: vm) { section = .check }
                default:
                    checkContent
                }

                Text(NSLocalizedString("scamShield.disclaimer", comment: ""))
                    .font(TappyFont.caption)
                    .foregroundColor(TappyColor.textSecondary)
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        // The message box is a multi-line TextEditor (Return inserts a line), so nothing dismissed its keyboard: it stayed up over the
        // result. Dragging the page now dismisses it, and the keyboard bar has a "Done" button.
        .scrollDismissesKeyboard(.interactively)
        // A message result lands under the box the person just typed in: bring it to the top of the screen.
        .onChange(of: vm.messageOutcome) { outcome in
            guard outcome != nil else { return }
            withAnimation { proxy.scrollTo("scam-msg-result", anchor: .top) }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button { UIApplication.shared.dismissKeyboard() } label: { Text("common.done") }
                    .accessibilityIdentifier("scam-keyboard-done")
            }
        }
        .background(TappyColor.background)
        .navigationTitle(NSLocalizedString("scamShield.title", comment: ""))
        .navigationBarTitleDisplayMode(.inline)
        // Opaque bar: scrolled content no longer ghosts through the title and the status bar (App Store shot 06).
        .toolbarBackground(TappyColor.background, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .confirmationDialog(Text("scam.link.confirm.title"), isPresented: Binding(
            get: { confirmOpenLink != nil }, set: { if !$0 { confirmOpenLink = nil } }
        ), titleVisibility: .visible) {
            Button(role: .destructive) {
                if let url = confirmOpenLink { UIApplication.shared.open(url) }
                confirmOpenLink = nil
            } label: { Text("scam.link.confirm.open") }
            Button(role: .cancel) { confirmOpenLink = nil } label: { Text("scam.link.dontOpen") }
        } message: {
            Text("scam.link.confirm.body")
        }
        .task { await applyDebugFixture() }
        }
    }

    /// CI fixture only (DEBUG): open a pane with a message / a QR code already in it.
    @MainActor
    private func applyDebugFixture() async {
        #if DEBUG
        switch UITestLaunch.scamPane {
        case "message": section = .message
        case "qr": section = .qr
        default: break
        }
        if UITestLaunch.scamQR != nil { section = .qr }
        if let text = UITestLaunch.scamMessage, vm.messageText.isEmpty {
            section = .message
            vm.messageText = text
            vm.checkMessage()
        }
        #endif
    }

    /// The link check (the original screen).
    @ViewBuilder
    private var checkContent: some View {
        TappyTextField(titleKey: "scamShield.urlPlaceholder", text: $vm.url)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

        Button {
            UIApplication.shared.dismissKeyboard()   // the result appears under the field: do not leave the keyboard over it
            Task { await vm.check() }
        } label: {
            Text(vm.loading
                 ? NSLocalizedString("scamShield.checking", comment: "")
                 : NSLocalizedString("scamShield.check", comment: ""))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.tappy(.primary))
        .disabled(!vm.canCheck)

        if vm.linkFromQR, vm.result != nil || vm.loading {
            Label { Text("scam.qr.linkNote") } icon: { Image(systemName: "qrcode") }
                .font(TappyFont.caption).foregroundColor(TappyColor.textSecondary)
        }

        if let result = vm.result {
            verdictCard(result)
            linkActions(result)
        }

        if let failure = vm.failure {
            unresolvedCard(failure)
        }
    }

    /// «Đừng mở» / «Mở thận trọng». The app never opens a link by itself; opening asks once more, and for a
    /// dangerous verdict the question says so.
    private func linkActions(_ result: ScamCheckResult) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                Button { vm.clear() } label: {
                    Text("scam.link.dontOpen").font(TappyFont.bodyEmphasis).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(TappyColor.primary)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("scam-link-dontopen")
                Button { confirmOpenLink = Self.openableURL(result.url) } label: {
                    Text("scam.link.openCareful").font(TappyFont.bodyEmphasis)
                        .foregroundStyle(ScamShieldLevelCopy.isDangerous(result.risk.level) ? TappyColor.danger : TappyColor.textPrimary)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(Self.openableURL(result.url) == nil)
                .accessibilityIdentifier("scam-link-opencareful")
            }
            ShareLink(item: Self.shareText(result)) {
                Label { Text("scam.share") } icon: { Image(systemName: "square.and.arrow.up") }.font(TappyFont.callout.weight(.semibold))
            }
            .accessibilityIdentifier("scam-link-share")
        }
    }

    private static func openableURL(_ raw: String) -> URL? {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let withScheme = s.lowercased().hasPrefix("http") ? s : "https://" + s
        guard let url = URL(string: withScheme), let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme) else { return nil }
        return url
    }

    /// What is shared: the verdict and the link, in plain words. No evidence dump, no tokens.
    private static func shareText(_ result: ScamCheckResult) -> String {
        [NSLocalizedString("scam.share.header", comment: ""),
         String(format: NSLocalizedString("scam.share.link", comment: ""), result.url,
                NSLocalizedString(result.verdict.linkTitleKey, comment: "")),
         NSLocalizedString("scam.share.footer", comment: "")].joined(separator: "\n")
    }

    // MARK: - Verdict

    private func verdictCard(_ result: ScamCheckResult) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                // Three states only (WEB 65685a7 / 93948b2): never «safe», never a score or a confidence figure.
                HStack(spacing: Spacing.sm) {
                    Image(systemName: ScamShieldLevelCopy.glyph(result.verdict))
                        .font(.title2)
                        .foregroundColor(ScamShieldLevelCopy.color(result.verdict))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(NSLocalizedString(result.verdict.linkTitleKey, comment: ""))
                            .font(TappyFont.headline)
                            .foregroundColor(ScamShieldLevelCopy.color(result.verdict))
                        Text(result.url)
                            .font(TappyFont.caption)
                            .foregroundColor(TappyColor.textSecondary)
                            .lineLimit(2)
                    }
                }

                Text(NSLocalizedString(result.verdict.linkBodyKey, comment: ""))
                    .font(TappyFont.callout)
                    .foregroundColor(TappyColor.textPrimary)

                if let entity = result.officialMatch {
                    Label(
                        String(format: NSLocalizedString("scamShield.officialMatch", comment: ""),
                               entity.brand, entity.website),
                        systemImage: "checkmark.seal.fill"
                    )
                    .font(TappyFont.caption)
                }

                if !result.actions.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        // Advice comes from the backend, already written for a human in the user's
                        // language. The phone does not invent recommendations of its own.
                        ForEach(result.actions) { action in
                            Text("• " + action.label(vietnamese: Self.isVietnamese))
                                .font(TappyFont.body)
                                .fontWeight(action.isPrimary ? .semibold : .regular)
                        }
                    }
                }

                // WEB 93948b2: the specific reasons, one finished sentence each, only for warning / critical findings.
                let reasons = result.evidence.items.filter(\.isReasonWorthy).compactMap { $0.reason(vietnamese: Self.isVietnamese) }
                if !reasons.isEmpty {
                    Text(NSLocalizedString("scamVerdict.link.reasons", comment: ""))
                        .font(TappyFont.bodyEmphasis)
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(reasons, id: \.self) { reason in
                            Text("• " + reason).font(TappyFont.callout)
                        }
                    }
                } else if !result.evidence.items.isEmpty {
                    // An older server sends no reason sentences: the technical findings stay behind the toggle.
                    Button {
                        evidenceOpen.toggle()
                    } label: {
                        HStack {
                            Text(NSLocalizedString("scamShield.evidence", comment: ""))
                            Spacer()
                            Image(systemName: evidenceOpen ? "chevron.up" : "chevron.down")
                        }
                        .font(TappyFont.body)
                    }
                    .buttonStyle(.plain)

                    if evidenceOpen {
                        VStack(alignment: .leading, spacing: Spacing.xs) {
                            ForEach(result.evidence.items) { item in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(item.source) — \(item.summary)")
                                        .font(TappyFont.caption)
                                        .fontWeight(.medium)
                                    if !item.detail.isEmpty {
                                        Text(item.detail)
                                            .font(TappyFont.caption)
                                            .foregroundColor(TappyColor.textSecondary)
                                    }
                                }
                            }
                        }
                    }
                }

                // Printed under EVERY verdict (WEB `scamVerdict.disclaimer`).
                Text(NSLocalizedString("scamVerdict.disclaimer", comment: ""))
                    .font(TappyFont.caption)
                    .foregroundColor(TappyColor.textSecondary)
            }
        }
    }

    // MARK: - Unresolved

    /// 🚨 Worded as "we could not check this", never as "nothing found".
    private func unresolvedCard(_ message: String) -> some View {
        TappyCard {
            HStack(alignment: .top, spacing: Spacing.sm) {
                Image(systemName: "shield.lefthalf.filled.slash")
                    .font(.title3)
                    .foregroundColor(Self.slate)
                VStack(alignment: .leading, spacing: 2) {
                    Text(NSLocalizedString("scamShield.unresolvedTitle", comment: ""))
                        .font(TappyFont.headline)
                    Text(message)
                        .font(TappyFont.caption)
                }
            }
        }
    }

    // MARK: - Level appearance

    /// The neutral colour reserved for "no verdict". Never used for a real risk level.
    private static let slate = Color(red: 0.39, green: 0.45, blue: 0.55)

    /// Read at render time from the app's own language, the same value RequestBuilder sends as
    /// Accept-Language — not the device locale, which can differ.
    private static var isVietnamese: Bool {
        LocalizationManager.currentLanguageCode == "vi"
    }
}

extension UIApplication {
    /// Ends editing in whichever field has focus (works for TextField and TextEditor alike).
    func dismissKeyboard() {
        sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}
