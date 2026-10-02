import Foundation

/// `POST /api/scam-shield/analyze` — the SERVER (AI-assisted) analysis of a message. Used only when the on-device
/// matcher could not decide, and only after the person agreed to share data with AI. The server does not keep the
/// message; this app does not keep it either. Decoding is lenient and FAIL-CLOSED: a verdict that will not decode is
/// `.unknown`, shown as «could not analyse», never as «safe».
struct ScamMessageAnalysis: Decodable, Equatable {
    struct Signal: Decodable, Equatable, Identifiable {
        let id = UUID()
        let type: String
        let severity: String
        let explanation: String
        private enum CodingKeys: String, CodingKey { case type, severity, explanation }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            type = (try? c.decode(String.self, forKey: .type)) ?? "other"
            severity = (try? c.decode(String.self, forKey: .severity)) ?? "low"
            explanation = (try? c.decode(String.self, forKey: .explanation)) ?? ""
        }
        static func == (l: Signal, r: Signal) -> Bool { l.type == r.type && l.explanation == r.explanation }
    }

    struct Advice: Decodable, Equatable, Identifiable {
        let id = UUID()
        let labelVi: String
        let labelEn: String
        private enum CodingKeys: String, CodingKey { case labelVi = "label_vi", labelEn = "label_en" }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            labelVi = (try? c.decode(String.self, forKey: .labelVi)) ?? ""
            labelEn = (try? c.decode(String.self, forKey: .labelEn)) ?? ""
        }
        func label(vietnamese: Bool) -> String {
            let preferred = vietnamese ? labelVi : labelEn
            return preferred.isEmpty ? (vietnamese ? labelEn : labelVi) : preferred
        }
        static func == (l: Advice, r: Advice) -> Bool { l.labelVi == r.labelVi && l.labelEn == r.labelEn }
    }

    let level: ScamRiskLevel
    let signals: [Signal]
    let doNot: [Advice]
    let doNow: [Advice]
    let summary: String
    /// `used`, `not_needed`, `quota_exhausted`, `unavailable`, `failed` — whether a model really looked.
    let aiStatus: String

    private enum CodingKeys: String, CodingKey { case risk, signals, advice, reasoningSummary, analysis }
    private enum AdviceKeys: String, CodingKey { case doNot, doNow }
    private enum AnalysisKeys: String, CodingKey { case aiStatus }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // 🚨 A missing / unreadable risk is `.unknown`, never `.safe`.
        level = ((try? c.decode(ScamRisk.self, forKey: .risk))?.level) ?? .unknown
        signals = (try? c.decode([Signal].self, forKey: .signals)) ?? []
        if let a = try? c.nestedContainer(keyedBy: AdviceKeys.self, forKey: .advice) {
            doNot = (try? a.decode([Advice].self, forKey: .doNot)) ?? []
            doNow = (try? a.decode([Advice].self, forKey: .doNow)) ?? []
        } else { doNot = []; doNow = [] }
        summary = (try? c.decode(String.self, forKey: .reasoningSummary)) ?? ""
        if let m = try? c.nestedContainer(keyedBy: AnalysisKeys.self, forKey: .analysis) {
            aiStatus = (try? m.decode(String.self, forKey: .aiStatus)) ?? ""
        } else { aiStatus = "" }
    }

    /// Whether the verdict may be drawn with reassuring wording at all (it never is for «quota»/«failed» runs).
    var isUsable: Bool { level != .unknown }
}
