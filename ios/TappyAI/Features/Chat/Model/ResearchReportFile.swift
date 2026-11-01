import Foundation
import UniformTypeIdentifiers

/// A form the finished report can be kept in: Markdown, PDF and Word. The row of buttons on the card is built from this list, so a new form is
/// a new case here and not a new layout.
enum ResearchExportFormat: CaseIterable, Sendable {
    case markdown
    case pdf
    case word

    /// The name on the button (a file format's own name, the same in every language).
    var label: String {
        switch self {
        case .markdown: return "Markdown"
        case .pdf: return "PDF"
        case .word: return "Word"
        }
    }

    var fileExtension: String {
        switch self {
        case .markdown: return "md"
        case .pdf: return "pdf"
        case .word: return "docx"
        }
    }

    /// The type the system's save dialog writes (`.md` and `.docx` fall back to what the system does know when it has no name for them).
    var contentType: UTType {
        switch self {
        case .markdown:
            return UTType(filenameExtension: "md", conformingTo: .plainText) ?? .plainText
        case .pdf:
            return .pdf
        case .word:
            return UTType("org.openxmlformats.wordprocessingml.document") ?? UTType(filenameExtension: "docx", conformingTo: .data) ?? .data
        }
    }
}

/// What the person is told after the system's save dialog closes (web: a line under the card; Android: `chat_research_saved` /
/// `chat_research_save_failed`).
enum ReportSaveNotice: Equatable, Sendable {
    case saved, failed

    /// The catalog key of the sentence.
    var key: String {
        switch self {
        case .saved: return "chat.research.saved"
        case .failed: return "chat.research.saveFailed"
        }
    }
}

/// The report as a file the person keeps: its text, its name, and what to say when the save ends. Built on the phone from what is on screen;
/// nothing is sent anywhere.
enum ResearchReportFile {

    /// The report's Markdown: its text, each chart's figures as a table under its section, the sources list linked (web `reportMarkdown`
    /// over `withChartTables`).
    static func markdown(report: String, charts: [ResearchChart], links: [ResearchLink], lang: String) -> String {
        reportMarkdown(withChartTables(report, charts, lang), links)
    }

    /// The file's bytes in `format`: the Markdown as UTF-8, the PDF from the same text with the sources' addresses in view, the Word file from the
    /// same Markdown the file keeps. Heavy for a long report: the card calls it off the main thread.
    static func data(format: ResearchExportFormat, report: String, charts: [ResearchChart], links: [ResearchLink], lang: String, title: String) -> Data {
        switch format {
        case .markdown:
            return Data(markdown(report: report, charts: charts, links: links, lang: lang).utf8)
        case .pdf:
            let text = reportForPdf(withChartTables(report, charts, lang), links)
            return writeReportPdf(title: title, blocks: pdfBlocks(text))
        case .word:
            return writeReportDocx(title: title, markdown: markdown(report: report, charts: charts, links: links, lang: lang))
        }
    }

    /// The file's name from the card's title (letters, digits, spaces and dashes, at most 60), "report" when there is none; the extension
    /// is the form's.
    static func fileName(title: String, format: ResearchExportFormat) -> String {
        reportFileName(title, format.fileExtension)
    }

    /// The notice for the result of the save dialog; nil when the person only chose Cancel (that is no failure).
    static func notice(for result: Result<URL, Error>) -> ReportSaveNotice? {
        switch result {
        case .success:
            return .saved
        case .failure(let error):
            let ns = error as NSError
            if ns.domain == NSCocoaErrorDomain, ns.code == CocoaError.userCancelled.rawValue { return nil }
            return .failed
        }
    }
}
