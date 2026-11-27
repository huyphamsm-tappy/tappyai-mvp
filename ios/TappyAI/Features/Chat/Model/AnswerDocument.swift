import Foundation

/// The one entry point for drawing an answer's text (layout step 2, spec §A «bộ phân tích khối»). It does not parse again: the parser is
/// `MarkdownBlocks.parse` (unchanged, its tests still pass) and the presentation rules are `MarkdownPresentation`. This name is the contract the
/// renderer and the tests use, so a later change to the parser lands in one place.
enum AnswerDocument {
    /// The drawing order of an answer's Markdown: blocks, with data boxes and numbered headings decided from the text's own structure.
    static func items(_ markdown: String) -> [PresentedBlock] {
        MarkdownPresentation.items(MarkdownBlocks.parse(markdown))
    }
}
