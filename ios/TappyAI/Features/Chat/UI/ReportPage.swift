import SwiftUI

// Layout step 4 (owner spec 26/11, BƯỚC 4 §2-3): the finished report as a summary card, and the full report page with four tabs
// (Tóm tắt · Nội dung · Dữ liệu · Nguồn). Everything shown is the server's text, its charts and its links; nothing is estimated.

/// The summary card of a finished research report: title, the first section's excerpt, «Nguồn: N», and three actions — the full page, the PDF
/// (the same file the progress card saves), and share.
struct ReportSummaryCard: View {
    let report: String
    let title: String
    let links: [ResearchLink]
    let charts: [ResearchChart]
    let lang: String

    @State private var showPage = false
    @State private var exporting = false
    @State private var document = ReportFileDocument()
    @State private var preparing = false
    @State private var notice: ReportSaveNotice? = nil

    private var excerpt: String { ResearchReportModel.excerpt(report) }
    private var sourceCount: Int { ResearchReportModel.sourceCount(report: report, links: links.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(title.isEmpty ? NSLocalizedString("chat.report.fallbackTitle", comment: "") : title)
                .font(TappyFont.headline).foregroundStyle(AnswerStyle.text).fixedSize(horizontal: false, vertical: true)
            if !excerpt.isEmpty {
                Text(excerpt).font(TappyFont.body).foregroundStyle(AnswerStyle.text).lineLimit(10)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if sourceCount > 0 {
                Text(String(format: NSLocalizedString("chat.report.sourceCount", comment: ""), sourceCount))
                    .font(TappyFont.footnote).foregroundStyle(AnswerStyle.secondary)
            }
            ChatFlowLayout(spacing: Spacing.xs) {
                Button { showPage = true } label: {
                    AnswerChip(text: NSLocalizedString("chat.report.openFull", comment: ""), symbol: "doc.text", selected: true)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("report-open")
                Button { startPdf() } label: {
                    AnswerChip(text: NSLocalizedString("chat.report.pdf", comment: ""), symbol: "arrow.down.doc")
                }
                .buttonStyle(.plain)
                .disabled(preparing)
                ShareLink(item: report) {
                    AnswerChip(text: NSLocalizedString("chat.report.share", comment: ""), symbol: "square.and.arrow.up")
                }
                .buttonStyle(.plain)
            }
            if let notice {
                Text(LocalizedStringKey(notice.key)).font(TappyFont.caption).foregroundStyle(AnswerStyle.secondary)
            }
        }
        .padding(Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .answerSurface()
        .accessibilityIdentifier("report-summary")
        .sheet(isPresented: $showPage) {
            ReportPageSheet(report: report, title: title, links: links, charts: charts, lang: lang)
        }
        .fileExporter(isPresented: $exporting, document: document, contentType: ResearchExportFormat.pdf.contentType,
                      defaultFilename: ResearchReportFile.fileName(title: title, format: .pdf)) { result in
            notice = ResearchReportFile.notice(for: result)
        }
    }

    // The PDF is built on the phone from the report on screen (off the main thread), then handed to the system's save dialog.
    private func startPdf() {
        guard !preparing else { return }
        preparing = true
        let title = self.title, links = self.links, charts = self.charts, lang = self.lang, report = self.report
        Task { @MainActor in
            let data = await Task.detached(priority: .userInitiated) {
                ResearchReportFile.data(format: .pdf, report: report, charts: charts, links: links, lang: lang, title: title)
            }.value
            document = ReportFileDocument(data: data)
            preparing = false
            exporting = true
        }
    }
}

/// The full report: four tabs over the same text. «Tóm tắt» is the first section; «Nội dung» the sections as closed accordions; «Dữ liệu» the
/// report's charts and data boxes; «Nguồn» the sources the report links to.
struct ReportPageSheet: View {
    let report: String
    let title: String
    let links: [ResearchLink]
    let charts: [ResearchChart]
    let lang: String

    enum Tab: String, CaseIterable, Identifiable {
        case summary, content, data, sources
        var id: String { rawValue }
        var label: LocalizedStringKey {
            switch self {
            case .summary: return "chat.report.tab.summary"
            case .content: return "chat.report.tab.content"
            case .data: return "chat.report.tab.data"
            case .sources: return "chat.report.tab.sources"
            }
        }
    }

    @State private var tab: Tab = .summary
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $tab) {
                    ForEach(Tab.allCases) { t in Text(t.label).tag(t) }
                }
                .pickerStyle(.segmented)
                .padding(Spacing.md)
                ScrollView {
                    VStack(alignment: .leading, spacing: Spacing.md) {
                        switch tab {
                        case .summary: summaryTab
                        case .content: contentTab
                        case .data: dataTab
                        case .sources: sourcesTab
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, AnswerStyle.margin)
                    .padding(.bottom, Spacing.xl)
                }
            }
            .background(ChatTheme.background)
            .navigationTitle(Text(verbatim: title))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button { dismiss() } label: { Text("common.close") } } }
        }
        .presentationDetents([.large])
    }

    private var summaryTab: some View {
        Text(ResearchReportModel.excerpt(report))
            .font(TappyFont.body).foregroundStyle(AnswerStyle.text).fixedSize(horizontal: false, vertical: true)
    }

    /// The section the model gave no heading for is keyed «Mở đầu» in the model (tests and the split depend on it); it is shown in the app's language.
    private static func displayTitle(_ title: String) -> String {
        title == ResearchReportModel.introTitle ? NSLocalizedString("chat.report.intro", comment: "") : title
    }

    /// Each `##` section as a closed accordion, under a contents line of the section titles.
    private var contentTab: some View {
        let sections = ResearchReportModel.sections(report)
        return VStack(alignment: .leading, spacing: Spacing.sm) {
            // The contents: the report's own section titles, in order (spec §3 «mục lục từ ## của báo cáo»).
            if sections.count > 1 {
                VStack(alignment: .leading, spacing: 4) {
                    Text("chat.report.toc").font(TappyFont.footnote.weight(.semibold)).foregroundStyle(AnswerStyle.secondary)
                    ForEach(Array(sections.enumerated()), id: \.offset) { i, section in
                        Text(verbatim: "\(i + 1). \(Self.displayTitle(section.title))").font(TappyFont.footnote).foregroundStyle(AnswerStyle.text)
                    }
                }
                .padding(Spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                .answerSurface(radius: AnswerStyle.chipRadius)
            }
            ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                AnswerAccordion(title: Self.displayTitle(section.title), symbol: "text.alignleft") {
                    MarkdownBlocksView(blocks: MarkdownBlocks.parse(section.body))
                }
            }
        }
    }

    /// The report's charts (under the section they belong to in the text, here in order) and its data boxes.
    private var dataTab: some View {
        let boxes = AnswerDocument.items(report).compactMap { item -> (String?, [[String]], String?)? in
            if case .dataBox(let t, let rows, let c) = item { return (t, rows, c) } else { return nil }
        }
        return VStack(alignment: .leading, spacing: Spacing.md) {
            ForEach(Array(charts.enumerated()), id: \.offset) { _, chart in
                ResearchChartView(chart: chart, lang: lang)
            }
            ForEach(Array(boxes.enumerated()), id: \.offset) { _, box in
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    if let caption = box.0 {
                        Text(verbatim: caption).font(TappyFont.bodyEmphasis).foregroundStyle(AnswerStyle.text)
                    }
                    MarkdownBlocksView(blocks: [.table(rows: box.1)])
                    if let note = box.2 {
                        Text(verbatim: note).font(TappyFont.footnote).foregroundStyle(AnswerStyle.secondary)
                    }
                }
            }
            if charts.isEmpty && boxes.isEmpty {
                Text("chat.report.noData").font(TappyFont.footnote).foregroundStyle(AnswerStyle.secondary)
            }
        }
    }

    private var sourcesTab: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            ForEach(links) { link in
                HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                    Text(verbatim: "\(link.id).").font(TappyFont.footnote).foregroundStyle(AnswerStyle.secondary)
                    if let url = ResearchCardModel.openableURL(link) {
                        Link(destination: url) {
                            Text(ResearchCardModel.sourceLabel(link)).font(TappyFont.footnote).foregroundStyle(AnswerStyle.accent)
                        }
                    } else {
                        Text(ResearchCardModel.sourceLabel(link)).font(TappyFont.footnote).foregroundStyle(AnswerStyle.secondary)
                    }
                }
            }
        }
    }
}
