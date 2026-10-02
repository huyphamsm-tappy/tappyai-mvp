import SwiftUI
import UIKit

/// «Kiểm tra tin nhắn» — paste a message. The reading happens ON THE PHONE against the ministry's 25 scenarios; the
/// text is not sent, kept or logged. No AI is used for a message (WEB 65685a7: AI off for the message check), and the
/// result is one of three states (`ScamVerdict`), never «safe».
struct ScamMessageView: View {
    @ObservedObject var vm: ScamShieldViewModel
    let knowledge: ScamKnowledge
    /// Start the link check for a link found in the message.
    let onCheckLink: (String) -> Void

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
            // Printed under EVERY verdict (WEB `scamVerdict.disclaimer`).
            Text("scamVerdict.disclaimer").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            actions(outcome)
        }
    }

    /// 🚨 Identifiers go on LEAF views only: an identifier on a container overwrites its children's (the button ids below).
    private func headerCard(icon: String, tint: Color, titleKey: LocalizedStringKey, id: String, detail: String? = nil) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            Image(systemName: icon).font(.title2).foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(titleKey).font(TappyFont.headline).foregroundStyle(tint).accessibilityIdentifier(id)
                if let detail { Text(detail).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary) }
            }
        }
    }

    private func matchedCard(_ scenario: ScamScenario, _ signals: [ScamMessageSignal]) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                // «Giống», not «là»: the match is a reading of words, not a finding about the sender.
                headerCard(icon: "exclamationmark.shield.fill", tint: TappyColor.danger, titleKey: "scam.msg.matched.title",
                           id: "scam-msg-matched", detail: scenario.official.title)
                Text("scam.msg.matched.body").font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                Text(scenario.official.summary).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                signalList(signals)
                ScamSourceBlock(source: scenario.source)
                // WEB `scamVerdict.scenario.report`: shown when a scenario matched.
                Text("scamVerdict.scenario.report").font(TappyFont.callout.weight(.semibold)).foregroundStyle(TappyColor.textPrimary)
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
    }

    private func unsureCard(_ signals: [ScamMessageSignal]) -> some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                headerCard(icon: "questionmark.diamond.fill", tint: TappyColor.secondary, titleKey: "scam.msg.unsure.title", id: "scam-msg-unsure")
                Text("scam.msg.unsure.body").font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                signalList(signals)
                adviceBlock(signals)
                ForEach(knowledge.official.preventionMeasures.prefix(3), id: \.self) { tip in
                    Label { Text(tip).font(TappyFont.callout) } icon: { Image(systemName: "info.circle") }
                        .foregroundStyle(TappyColor.textPrimary)
                }
                Text("scam.msg.notGov").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
            }
        }
    }

    /// 🚨 Never a green shield and never «safe»: nothing familiar was seen, which is not the same thing.
    private var noSignsCard: some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.sm) {
                headerCard(icon: "shield.lefthalf.filled", tint: TappyColor.textSecondary, titleKey: "scam.msg.nosigns.title", id: "scam-msg-nosigns")
                Text("scam.msg.nosigns.body").font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
            }
        }
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
