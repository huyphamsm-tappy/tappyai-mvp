import SwiftUI

/// The Deep Research card (web `ResearchCard.tsx`, Android `ResearchCard.kt`): the plan, each step's progress and the cited sources, drawn
/// from the server's `tappy.research.v1` frame (re-checked in `OneBrainFrames`). The report is the reply under it. The card never opens an
/// address itself: a tap on a source goes to `onOpenLink`, and only an address `safeWebURL` accepts is a tap target.
struct ResearchCardView: View {
    let status: ResearchStatus
    var onOpenLink: (URL) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: Spacing.xxs) {
                Text("🔎").accessibilityHidden(true)
                phaseText
            }
            .font(TappyFont.caption.weight(.medium))
            .foregroundStyle(TappyColor.primary)

            if !status.title.isEmpty {
                Text(status.title)
                    .font(TappyFont.headline)
                    .foregroundStyle(TappyColor.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            ForEach(Array(status.steps.enumerated()), id: \.offset) { _, step in
                stepRow(step)
            }

            if !status.links.isEmpty {
                Divider()
                Text("chat.research.sources")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                ForEach(status.links) { link in
                    sourceRow(link)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityElement(children: .contain)
    }

    // The phase line, with the count of sources where there is one (the catalog's "%lld" keys).
    private var phaseText: Text {
        switch status.phase {
        case .planning: return Text("chat.research.planning")
        case .researching: return Text("chat.research.researching \(status.sources)")
        case .writing: return Text("chat.research.writing \(status.sources)")
        case .done: return Text("chat.research.done \(status.sources)")
        case .failed: return Text("chat.research.failed")
        }
    }

    private func stepRow(_ step: ResearchStep) -> some View {
        let isDone = step.status == .done
        return HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
            Text(ResearchCardModel.stepMark(step.status))
                .font(TappyFont.footnote)
                .foregroundStyle(isDone ? TappyColor.primary : TappyColor.textSecondary)
                .frame(width: 16)
                .accessibilityHidden(true)
            Text(step.title)
                .font(TappyFont.footnote)
                .foregroundStyle(isDone ? TappyColor.textPrimary : TappyColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        // the mark alone says nothing to VoiceOver: the step's words, then its state
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(step.title))
        .accessibilityValue(Text(LocalizedStringKey(ResearchCardModel.stepStatusKey(step.status))))
    }

    @ViewBuilder
    private func sourceRow(_ link: ResearchLink) -> some View {
        let label = ResearchCardModel.sourceLabel(link)
        HStack(alignment: .firstTextBaseline, spacing: Spacing.xxs) {
            Text(verbatim: "\(link.id).")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
            if let url = ResearchCardModel.openableURL(link) {
                Button {
                    onOpenLink(url)
                } label: {
                    Text(label)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(verbatim: "\(link.id). \(label)"))
                .accessibilityAddTraits(.isLink)
            } else {
                Text(label)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
        }
        .minimumTapTarget()
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
