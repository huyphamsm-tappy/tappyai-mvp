import Foundation

/// The rules of the Deep Research card (web `ResearchCard.tsx`, Android `ResearchCard.kt`): the mark of a step, the words VoiceOver says for
/// it, the name and the address of a source, and when the finished report can be kept. The view only draws what this says.
enum ResearchCardModel {

    /// The mark in front of a step: ○ waiting, ◌ running, ✓ done, – failed.
    static func stepMark(_ status: ResearchStepStatus) -> String {
        switch status {
        case .pending: return "○"
        case .running: return "◌"
        case .done: return "✓"
        case .failed: return "–"
        }
    }

    /// The catalog key of the words for a step's state (the mark alone says nothing to VoiceOver).
    static func stepStatusKey(_ status: ResearchStepStatus) -> String {
        switch status {
        case .pending: return "chat.research.step.pending"
        case .running: return "chat.research.step.running"
        case .done: return "chat.research.step.done"
        case .failed: return "chat.research.step.failed"
        }
    }

    /// What a source is called on the card: its title, or else its site (or, with neither, its address).
    static func sourceLabel(_ link: ResearchLink) -> String {
        let title = link.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !title.isEmpty { return title }
        return URL(string: link.url)?.host ?? link.url
    }

    /// The address a tap on a source opens: http(s) with a host and never another AI product's page (`safeWebURL`), else nothing.
    static func openableURL(_ link: ResearchLink) -> URL? {
        safeWebURL(link.url)
    }

    /// The report can be kept once the research is done and the reply has text.
    static func offersDownload(phase: ResearchPhase, report: String?) -> Bool {
        guard phase == .done, let report else { return false }
        return !report.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
