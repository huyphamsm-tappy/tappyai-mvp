import SwiftUI

/// The Deep Research card (web `ResearchCard.tsx`, Android `ResearchCard.kt`): the plan, each step's progress and the cited sources, drawn
/// from the server's `tappy.research.v1` frame (re-checked in `OneBrainFrames`). The report is the reply under it. The card never opens an
/// address itself: a tap on a source goes to `onOpenLink`, and only an address `safeWebURL` accepts is a tap target.
struct ResearchCardView: View {
    let status: ResearchStatus
    /// The reply's finished text: the report the card offers to keep once the research is done (nil while it is still being written).
    var report: String? = nil
    /// The report's charts: their figures go into the saved file as tables under their sections.
    var charts: [ResearchChart] = []
    /// "vi" or "en": the language the saved file's figures and captions are written in.
    var lang: String = "en"
    var onOpenLink: (URL) -> Void = { _ in }

    @State private var exporting = false
    @State private var document = MarkdownReportDocument(text: "")
    @State private var notice: ReportSaveNotice? = nil

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

            if ResearchCardModel.offersDownload(phase: status.phase, report: report) {
                Divider()
                downloadRow
                if let notice {
                    Text(LocalizedStringKey(notice.key))
                        .font(TappyFont.caption)
                        .foregroundStyle(notice == .failed ? TappyColor.danger : TappyColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).stroke(TappyColor.border, lineWidth: 1))
        .accessibilityElement(children: .contain)
        // the file goes where the person chooses (the system's save dialog); nothing is uploaded
        .fileExporter(isPresented: $exporting, document: document, contentType: MarkdownReportDocument.markdownType,
                      defaultFilename: ResearchReportFile.fileName(title: status.title, format: .markdown)) { result in
            notice = ResearchReportFile.notice(for: result)
        }
        // the line under the buttons goes away by itself
        .task(id: notice) {
            guard notice != nil else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if !Task.isCancelled { notice = nil }
        }
    }

    // "Download report:" and one button per form (a wrapping row, so a form added later needs no new layout).
    private var downloadRow: some View {
        ChatFlowLayout(spacing: Spacing.xs) {
            Text("chat.research.download")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
            ForEach(ResearchExportFormat.allCases, id: \.self) { format in
                Button {
                    startExport(format)
                } label: {
                    Text(format.label)
                        .font(TappyFont.caption.weight(.medium))
                        .foregroundStyle(TappyColor.textPrimary)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, Spacing.xxs)
                        .overlay(Capsule().stroke(TappyColor.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .minimumTapTarget()
            }
        }
    }

    private func startExport(_ format: ResearchExportFormat) {
        guard let report else { return }
        switch format {
        case .markdown:
            document = MarkdownReportDocument(text: ResearchReportFile.markdown(report: report, charts: charts, links: status.links, lang: lang))
            exporting = true
        }
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
