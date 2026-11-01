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

    /// The menu's rule (web `setChatMode(m => (m === key ? 'auto' : key))`): the mode in use, picked again, goes back to Auto.
    func picked(_ choice: ChatMode) -> ChatMode { self == choice ? .auto : choice }

    /// The mode once a question is sent: Deep Research is for that one question (web `setChatMode(m => (m === 'deep' ? 'auto' : m))`).
    func afterSend() -> ChatMode { self == .deep ? .auto : self }

    /// What the "+" menu offers beside attaching. People just type: Auto picks a quick answer, a web lookup or thinking by itself,
    /// so only Deep Research is a choice. Chat, Web and Think stay modes the server understands, not menu items.
    static let menu: [ChatMode] = [.deep]

    /// The modes the menu offers for this account (web `tiers.ts`, which the server enforces: a mode the plan lacks runs as Chat).
    /// A visitor, or an account without a live plan, or the free plan, has none; every paid plan has the whole menu.
    /// `nil` = plans not on sale or not known yet: the whole menu, never less.
    static func menuFor(_ access: PlanAccess?) -> [ChatMode] {
        guard let access else { return menu }
        if !access.signedIn || access.state != "ACTIVE" || access.planId == "free" { return [] }
        return menu
    }
}
