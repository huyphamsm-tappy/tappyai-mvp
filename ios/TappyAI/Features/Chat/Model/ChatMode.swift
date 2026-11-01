import Foundation

/// How a turn is answered, as the one-brain server reads it from the request body's `mode` (web `ChatMode`,
/// `src/lib/ai/security/clientInput.ts`). A request without a mode runs as `chat`; the web composer sends `auto` by default.
/// The server decides whether the account's plan may use a mode and answers with the nearest one it may.
enum ChatMode: String, CaseIterable, Sendable {
    /// Chat until the model decides the question needs thinking (`think_deeper`); the default.
    case auto
    /// The fast chat model, no extra thinking.
    case chat
    /// Always looks the question up on the web.
    case web
    /// Reasoning with tools.
    case think
    /// Deep Research: plan, research branches, one report (a long turn, counted per month by plan).
    case deep

    /// The value sent as `mode`.
    var wire: String { rawValue }

    /// What a turn runs as unless the person picked another mode.
    static let `default`: ChatMode = .auto
}
