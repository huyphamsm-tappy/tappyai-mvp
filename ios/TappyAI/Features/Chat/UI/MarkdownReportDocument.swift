import SwiftUI
import UniformTypeIdentifiers

/// The Markdown file the system's save dialog writes (`fileExporter`): the report's text as UTF-8. The person chooses where it goes; the app
/// sends it nowhere.
struct MarkdownReportDocument: FileDocument {
    /// `.md`'s own type where the system knows it, else plain text with the same extension.
    static var markdownType: UTType { ResearchExportFormat.markdown.contentType }

    static var readableContentTypes: [UTType] { [markdownType, .plainText] }
    static var writableContentTypes: [UTType] { [markdownType] }

    var text: String

    init(text: String) {
        self.text = text
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents,
              let text = String(data: data, encoding: .utf8) else { throw CocoaError(.fileReadCorruptFile) }
        self.text = text
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

/// The report's file as bytes, for the one save dialog of the card: Markdown, PDF or Word (which of them is the `contentType` given to
/// `fileExporter`, one of the types below). The person chooses where it goes; the app sends it nowhere.
struct ReportFileDocument: FileDocument {
    static var readableContentTypes: [UTType] { ResearchExportFormat.allCases.map { $0.contentType } }
    static var writableContentTypes: [UTType] { ResearchExportFormat.allCases.map { $0.contentType } }

    var data: Data

    init(data: Data = Data()) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
