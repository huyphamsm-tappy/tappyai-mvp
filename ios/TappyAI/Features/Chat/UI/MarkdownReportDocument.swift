import SwiftUI
import UniformTypeIdentifiers

/// The Markdown file the system's save dialog writes (`fileExporter`): the report's text as UTF-8. The person chooses where it goes; the app
/// sends it nowhere.
struct MarkdownReportDocument: FileDocument {
    /// `.md`'s own type where the system knows it, else plain text with the same extension.
    static var markdownType: UTType { UTType(filenameExtension: "md", conformingTo: .plainText) ?? .plainText }

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
