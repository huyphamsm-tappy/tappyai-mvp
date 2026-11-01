import Foundation

/// A form the finished report can be kept in. One today; the row of buttons on the card is built from this list, so a new form is a new case
/// here and not a new layout.
enum ResearchExportFormat: CaseIterable, Sendable {
    case markdown

    /// The name on the button (a file format's own name, the same in every language).
    var label: String {
        switch self {
        case .markdown: return "Markdown"
        }
    }

    var fileExtension: String {
        switch self {
        case .markdown: return "md"
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
