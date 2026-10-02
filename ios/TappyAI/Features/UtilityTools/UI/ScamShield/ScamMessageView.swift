import SwiftUI
import UIKit

/// «Kiểm tra tin nhắn» — paste a message. The reading happens ON THE PHONE against the ministry's 25 scenarios; the
/// text is not sent, kept or logged. Only if the person taps «Phân tích sâu hơn» (and agreed to share data with AI)
/// does the text go to the server analysis.
struct ScamMessageView: View {
    @ObservedObject var vm: ScamShieldViewModel
    let knowledge: ScamKnowledge
    /// Start the link check for a link found in the message.
    let onCheckLink: (String) -> Void

    private static var isVietnamese: Bool { LocalizationManager.currentLanguageCode == "vi" }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("scam.msg.intro").font(TappyFont.body).foregroundStyle(TappyColor.textSecondary)

            ZStack(alignment: .topLeading) {
                TextEditor(text: $vm.messageText)
                    .frame(minHeight: 140)
                    .scrollContentBackground(.hidden)
                    .padding(Spacing.xs)
                    .accessibilityIdentifier("scam-msg-input")
                if vm.messageText.isEmpty {
                    Text("scam.msg.placeholder").font(TappyFont.body).foregroundStyle(TappyColor.textSecondary.opacity(0.7))
                        .padding(.horizontal, Spacing.sm + 4).padding(.vertical, Spacing.sm + 6).allowsHitTesting(false)
                }
            }
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).stroke(TappyColor.border, lineWidth: 1))

            HStack {
                Button {
                    if let s = UIPasteboard.general.string { vm.messageText = String(s.prefix(ScamMessageMatcher.maxChars)) }
                } label: { Label { Text("scam.msg.paste") } icon: { Image(systemName: "doc.on.clipboard") }.font(TappyFont.callout) }
                .accessibilityIdentifier("scam-msg-paste")
                Spacer()
                Text("\(vm.messageText.count)/\(ScamMessageMatcher.maxChars)").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            }

            Button { vm.checkMessage() } label: {
                Text("scam.msg.check").frame(maxWidth: .infinity)
            }
            .buttonStyle(.tappy(.primary))
            .disabled(!vm.canCheckMessage)
            .accessibilityIdentifier("scam-msg-check")

            Text("scam.msg.privacy").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)

            if let outcome = vm.messageOutcome { result(outcome) }
        }
    }

    // MARK: Result

    @ViewBuilder
    private func result(_ outcome: ScamMessageOutcome) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            switch outcome {
            case .matched(let number, let signals, _):
                if let scenario = knowledge.scenarios.first(where: { $0.officialNumber == number }) {
                    matchedCard(scenario, signals)
                } else {
                    unsureCard(signals)
                }
            case .unsure(let signals, _):
                unsureCard(signals)
            case .noSigns:
                noSignsCard
            }

            if !outcome.links.isEmpty { linksCard(outcome.links) }
            deeperSection
            actions(outcome)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("scam-msg-result")
    }

    private func headerCard(icon: String, tint: Color, titleKey: LocalizedStringKey, detail: String? = nil) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Image(systemName: icon).font(.title2).foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(titleKey).font(TappyFont.headline).foregroundStyle(tint)
                if let detail { Text(detail).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary) }
            }
        }
    }

    private func matchedCard(_ scenario: ScamScenario, _ signals: [ScamMessageSignal]) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                // «Giống», not «là»: the match is a reading of words, not a finding about the sender.
                headerCard(icon: "exclamationmark.shield.fill", tint: TappyColor.danger, titleKey: "scam.msg.matched.title",
                           detail: scenario.official.title)
                Text(scenario.official.summary).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                signalList(signals)
                ScamSourceBlock(source: scenario.source)
                NavigationLink {
                    ScamScenarioDetailView(scenario: scenario, advice: knowledge.official)
                } label: {
                    Label { Text("scam.msg.matched.more") } icon: { Image(systemName: "chevron.right") }
                        .font(TappyFont.callout.weight(.semibold))
                }
                .accessibilityIdentifier("scam-msg-detail")
                adviceBlock(signals)
            }
        }
        .accessibilityIdentifier("scam-msg-matched")
    }

    private func unsureCard(_ signals: [ScamMessageSignal]) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                headerCard(icon: "questionmark.diamond.fill", tint: TappyColor.secondary, titleKey: "scam.msg.unsure.title")
                Text("scam.msg.unsure.body").font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                signalList(signals)
                adviceBlock(signals)
                ForEach(knowledge.official.preventionMeasures.prefix(3), id: \.self) { tip in
                    Label { Text(tip).font(TappyFont.callout) } icon: { Image(systemName: "checkmark.circle") }
                        .foregroundStyle(TappyColor.textPrimary)
                }
                Text("scam.msg.notGov").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            }
        }
        .accessibilityIdentifier("scam-msg-unsure")
    }

    /// 🚨 Never a green shield and never «safe»: nothing familiar was seen, which is not the same thing.
    private var noSignsCard: some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                headerCard(icon: "shield.lefthalf.filled", tint: TappyColor.textSecondary, titleKey: "scam.msg.nosigns.title")
                Text("scam.msg.nosigns.body").font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
            }
        }
        .accessibilityIdentifier("scam-msg-nosigns")
    }

    private func signalList(_ signals: [ScamMessageSignal]) -> some View {
        Group {
            if !signals.isEmpty {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("scam.msg.why").font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                    ForEach(signals, id: \.self) { s in
                        HStack(alignment: .top, spacing: Spacing.xs) {
                            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 12)).foregroundStyle(TappyColor.secondary).padding(.top, 3)
                            Text(LocalizedStringKey(s.explanationKey)).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                        }
                    }
                }
            }
        }
    }

    /// Plain «do not» lines keyed on what the message asked for (the same ideas the server's advice uses).
    private func adviceBlock(_ signals: [ScamMessageSignal]) -> some View {
        let keys: [String] = signals.compactMap {
            switch $0 {
            case .otp: return "scam.msg.advice.otp"
            case .link: return "scam.msg.advice.link"
            case .transfer, .prize: return "scam.msg.advice.transfer"
            case .installApp: return "scam.msg.advice.install"
            case .remoteAccess: return "scam.msg.advice.remote"
            case .qr: return "scam.msg.advice.qr"
            case .urgency: return "scam.msg.advice.rush"
            case .authority, .bank, .fine: return "scam.msg.advice.verify"
            default: return nil
            }
        }
        let unique = Array(NSOrderedSet(array: keys)) as? [String] ?? keys
        return Group {
            if !unique.isEmpty {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("scam.msg.advice.title").font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                    ForEach(unique, id: \.self) { key in
                        Label { Text(LocalizedStringKey(key)).font(TappyFont.callout) } icon: { Image(systemName: "hand.raised.fill") }
                            .foregroundStyle(TappyColor.textPrimary)
                    }
                }
            }
        }
    }

    private func linksCard(_ links: [String]) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("scam.msg.links.title").font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.textPrimary)
                Text("scam.msg.links.note").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                ForEach(links, id: \.self) { link in
                    HStack {
                        Text(link).font(TappyFont.caption).foregroundStyle(TappyColor.textPrimary).lineLimit(2)
                        Spacer(minLength: Spacing.xs)
                        Button { onCheckLink(link) } label: {
                            Text("scam.msg.links.check").font(TappyFont.callout.weight(.semibold))
                        }
                        .accessibilityIdentifier("scam-msg-check-link")
                    }
                }
            }
        }
    }

    // MARK: Deeper analysis (server, AI) — opt-in

    @ViewBuilder
    private var deeperSection: some View {
        if let analysis = vm.messageAnalysis {
            analysisCard(analysis)
        } else {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Button { Task { await vm.analyzeMessageDeeper() } } label: {
                    HStack {
                        if vm.messageAnalyzing { ProgressView().tint(TappyColor.primary) }
                        Text(vm.messageAnalyzing ? "scam.msg.deeper.running" : "scam.msg.deeper.button")
                    }
                    .font(TappyFont.bodyEmphasis).foregroundStyle(TappyColor.primary)
                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(TappyColor.primary.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(vm.messageAnalyzing)
                .accessibilityIdentifier("scam-msg-deeper")
                Text("scam.msg.deeper.note").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                if let failure = vm.messageAnalysisFailure {
                    Text(failure).font(TappyFont.caption).foregroundStyle(TappyColor.danger).accessibilityIdentifier("scam-msg-deeper-failure")
                }
            }
        }
    }

    private func analysisCard(_ a: ScamMessageAnalysis) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("scam.msg.deeper.title").font(TappyFont.headline).foregroundStyle(TappyColor.textPrimary)
                Text(LocalizedStringKey(ScamShieldLevelCopy.levelKey(a.level))).font(TappyFont.bodyEmphasis)
                    .foregroundStyle(ScamShieldLevelCopy.color(a.level))
                if !a.summary.isEmpty { Text(a.summary).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary) }
                ForEach(a.signals.prefix(6)) { s in
                    if !s.explanation.isEmpty {
                        Label { Text(s.explanation).font(TappyFont.callout) } icon: { Image(systemName: "exclamationmark.triangle.fill") }
                            .foregroundStyle(TappyColor.textPrimary)
                    }
                }
                ForEach(a.doNot.prefix(4)) { d in
                    Label { Text(d.label(vietnamese: Self.isVietnamese)).font(TappyFont.callout) } icon: { Image(systemName: "hand.raised.fill") }
                        .foregroundStyle(TappyColor.textPrimary)
                }
                ForEach(a.doNow.prefix(4)) { d in
                    Label { Text(d.label(vietnamese: Self.isVietnamese)).font(TappyFont.callout) } icon: { Image(systemName: "checkmark.circle") }
                        .foregroundStyle(TappyColor.textPrimary)
                }
            }
        }
        .accessibilityIdentifier("scam-msg-analysis")
    }

    // MARK: Actions (share — never the message itself)

    private func actions(_ outcome: ScamMessageOutcome) -> some View {
        HStack(spacing: Spacing.md) {
            ShareLink(item: shareText(outcome)) {
                Label { Text("scam.share") } icon: { Image(systemName: "square.and.arrow.up") }.font(TappyFont.callout.weight(.semibold))
            }
            .accessibilityIdentifier("scam-msg-share")
            Spacer()
            Button { vm.clearMessage() } label: { Text("scam.msg.clear").font(TappyFont.callout) }
                .accessibilityIdentifier("scam-msg-clear")
        }
    }

    /// 🚨 What is shared is the READING (name of the situation + the plain advice), not the message the person pasted.
    private func shareText(_ outcome: ScamMessageOutcome) -> String {
        var lines: [String] = [NSLocalizedString("scam.share.header", comment: "")]
        switch outcome {
        case .matched(let number, _, _):
            if let s = knowledge.scenarios.first(where: { $0.officialNumber == number }) {
                lines.append(String(format: NSLocalizedString("scam.share.matched", comment: ""), s.official.title))
                lines.append(contentsOf: s.guidance.whatNotToDo.prefix(2).map { "• " + $0 })
            }
        case .unsure:
            lines.append(NSLocalizedString("scam.share.unsure", comment: ""))
        case .noSigns:
            lines.append(NSLocalizedString("scam.share.nosigns", comment: ""))
        }
        lines.append(NSLocalizedString("scam.share.footer", comment: ""))
        return lines.joined(separator: "\n")
    }
}
