import SwiftUI

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

    init(deps: AppDependencies) {
        let service = UtilityToolsService(api: deps.api)
        _vm = AppStateObject(wrappedValue: ScamShieldViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text(NSLocalizedString("scamShield.subtitle", comment: ""))
                    .font(TappyFont.body)
                    .foregroundColor(TappyColor.textSecondary)

                TappyTextField(titleKey: "scamShield.urlPlaceholder", text: $vm.url)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                Button {
                    Task { await vm.check() }
                } label: {
                    Text(vm.loading
                         ? NSLocalizedString("scamShield.checking", comment: "")
                         : NSLocalizedString("scamShield.check", comment: ""))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.tappy(.primary))
                .disabled(!vm.canCheck)

                if let result = vm.result {
                    verdictCard(result)
                }

                if let failure = vm.failure {
                    unresolvedCard(failure)
                }

                Text(NSLocalizedString("scamShield.disclaimer", comment: ""))
                    .font(TappyFont.caption)
                    .foregroundColor(TappyColor.textSecondary)
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle(NSLocalizedString("scamShield.title", comment: ""))
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Verdict

    private func verdictCard(_ result: ScamCheckResult) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: Self.glyph(for: result.risk.level))
                        .font(.title2)
                        .foregroundColor(Self.color(for: result.risk.level))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(NSLocalizedString(Self.levelKey(for: result.risk.level), comment: ""))
                            .font(TappyFont.headline)
                            .foregroundColor(Self.color(for: result.risk.level))
                        Text(result.url)
                            .font(TappyFont.caption)
                            .foregroundColor(TappyColor.textSecondary)
                            .lineLimit(2)
                    }
                }

                Text(String(format: NSLocalizedString("scamShield.score", comment: ""),
                            result.risk.score, result.risk.confidence))
                    .font(TappyFont.caption)
                    .foregroundColor(TappyColor.textSecondary)

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

                if !result.evidence.items.isEmpty {
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

    /// 🚨 Exhaustive over `ScamRiskLevel` with no `default` branch: adding a level to the enum
    /// stops compiling here until it has been given a deliberate appearance, rather than falling
    /// through to whatever the author picked last. Mirrors `LEVEL_STYLES` in ScamShieldResult.tsx.
    private static func color(for level: ScamRiskLevel) -> Color {
        switch level {
        case .safe: return Color(red: 0.09, green: 0.64, blue: 0.29)
        case .low: return Color(red: 0.15, green: 0.39, blue: 0.92)
        case .medium: return Color(red: 0.79, green: 0.54, blue: 0.02)
        case .high: return Color(red: 0.92, green: 0.35, blue: 0.05)
        case .critical: return Color(red: 0.86, green: 0.15, blue: 0.15)
        case .inconclusive: return slate
        case .unknown: return slate
        }
    }

    private static func glyph(for level: ScamRiskLevel) -> String {
        switch level {
        case .safe: return "checkmark.shield.fill"
        case .low: return "checkmark.shield.fill"
        case .medium: return "exclamationmark.shield.fill"
        case .high: return "xmark.shield.fill"
        case .critical: return "xmark.shield.fill"
        case .inconclusive: return "shield.lefthalf.filled.slash"
        case .unknown: return "shield.lefthalf.filled.slash"
        }
    }

    private static func levelKey(for level: ScamRiskLevel) -> String {
        switch level {
        case .safe: return "scamShield.level.safe"
        case .low: return "scamShield.level.low"
        case .medium: return "scamShield.level.medium"
        case .high: return "scamShield.level.high"
        case .critical: return "scamShield.level.critical"
        case .inconclusive: return "scamShield.level.inconclusive"
        case .unknown: return "scamShield.level.inconclusive"
        }
    }

    /// Read at render time from the app's own language, the same value RequestBuilder sends as
    /// Accept-Language — not the device locale, which can differ.
    private static var isVietnamese: Bool {
        LocalizationManager.currentLanguageCode == "vi"
    }
}
