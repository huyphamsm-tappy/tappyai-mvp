import Foundation

/// Scam Shield domain types for iOS (B09).
///
/// 🚨 The backend at `POST /api/scam-shield/check` is the ONLY authority on whether a URL is a
/// scam. Nothing in this file scores, classifies or second-guesses a link — it decodes the
/// verdict. A second scoring implementation here would be a second place for a mis-scoring bug to
/// live, and B01 (a bank phishing link reported as safe) was exactly that bug, fixed once, on the
/// server.

/// Risk levels, mirroring `RiskLevel` in `src/lib/scam-shield/types.ts`.
enum ScamRiskLevel: String, Decodable, CaseIterable {
    case safe = "SAFE"
    case low = "LOW"
    case medium = "MEDIUM"
    case high = "HIGH"
    case critical = "CRITICAL"

    /// 🚨 Not a mild `safe`. The engine reports this when too little of its evidence base
    /// responded to stand behind a reassuring answer.
    case inconclusive = "INCONCLUSIVE"

    /// A level this build does not know — presented exactly like `inconclusive`.
    case unknown = "UNKNOWN"

    /// 🚨 Decodes an unrecognised level to `.unknown`, never to `.safe`. Without this, a level the
    /// backend adds after this app ships would fail decoding (or, with a `.safe` default, become a
    /// silent false reassurance).
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self).uppercased()
        self = ScamRiskLevel(rawValue: raw).flatMap { $0 == .unknown ? .unknown : $0 } ?? .unknown
    }

    /// Whether this level may be presented with reassuring colour and wording.
    var isReassuring: Bool {
        self == .safe || self == .low
    }
}

enum ScamSignalSeverity: String, Decodable {
    case safe, info, warning, critical, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self).lowercased()
        self = ScamSignalSeverity(rawValue: raw) ?? .unknown
    }
}

struct ScamRisk: Decodable {
    let score: Int
    let confidence: Int
    let level: ScamRiskLevel

    enum CodingKeys: String, CodingKey { case score, confidence, level }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        score = (try? c.decode(Int.self, forKey: .score)) ?? 0
        confidence = (try? c.decode(Int.self, forKey: .confidence)) ?? 0
        // 🚨 A missing level is `.unknown`, never `.safe`.
        level = (try? c.decode(ScamRiskLevel.self, forKey: .level)) ?? .unknown
    }
}

struct ScamEvidenceItem: Decodable, Identifiable {
    let id = UUID()
    let source: String
    let severity: ScamSignalSeverity
    let summary: String
    let detail: String

    enum CodingKeys: String, CodingKey { case source, severity, summary, detail }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        source = (try? c.decode(String.self, forKey: .source)) ?? ""
        severity = (try? c.decode(ScamSignalSeverity.self, forKey: .severity)) ?? .unknown
        summary = (try? c.decode(String.self, forKey: .summary)) ?? ""
        detail = (try? c.decode(String.self, forKey: .detail)) ?? ""
    }
}

struct ScamEvidenceReport: Decodable {
    let items: [ScamEvidenceItem]

    enum CodingKeys: String, CodingKey { case items }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = (try? c.decode([ScamEvidenceItem].self, forKey: .items)) ?? []
    }
}

struct ScamOfficialEntity: Decodable {
    let brand: String
    let website: String
    let hotline: String?
}

struct ScamRecommendedAction: Decodable, Identifiable {
    let id = UUID()
    let priority: String
    let labelVi: String
    let labelEn: String

    enum CodingKeys: String, CodingKey {
        case priority
        case labelVi = "label_vi"
        case labelEn = "label_en"
    }

    var isPrimary: Bool { priority == "primary" }

    /// The backend ships both languages for each action; pick the one the user reads, falling back
    /// to the other rather than rendering an empty row.
    func label(vietnamese: Bool) -> String {
        let preferred = vietnamese ? labelVi : labelEn
        return preferred.isEmpty ? (vietnamese ? labelEn : labelVi) : preferred
    }
}

struct ScamCheckResult: Decodable {
    let url: String
    let risk: ScamRisk
    let evidence: ScamEvidenceReport
    let officialMatch: ScamOfficialEntity?
    let actions: [ScamRecommendedAction]
    let cached: Bool

    enum CodingKeys: String, CodingKey { case url, risk, evidence, officialMatch, actions, cached }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        url = (try? c.decode(String.self, forKey: .url)) ?? ""
        // A risk block that will not decode leaves `.unknown`, which the UI shows as unresolved.
        risk = (try? c.decode(ScamRisk.self, forKey: .risk)) ?? ScamRisk.unresolved
        evidence = (try? c.decode(ScamEvidenceReport.self, forKey: .evidence)) ?? ScamEvidenceReport.empty
        officialMatch = try? c.decodeIfPresent(ScamOfficialEntity.self, forKey: .officialMatch)
        actions = (try? c.decode([ScamRecommendedAction].self, forKey: .actions)) ?? []
        cached = (try? c.decode(Bool.self, forKey: .cached)) ?? false
    }
}

extension ScamRisk {
    /// 🚨 Score 0 here does NOT mean "safe" — it means "no verdict". `.unknown` is what carries
    /// that meaning to the UI.
    static let unresolved = ScamRisk(score: 0, confidence: 0, level: .unknown)

    init(score: Int, confidence: Int, level: ScamRiskLevel) {
        self.score = score
        self.confidence = confidence
        self.level = level
    }
}

extension ScamEvidenceReport {
    static let empty = ScamEvidenceReport(items: [])

    init(items: [ScamEvidenceItem]) {
        self.items = items
    }
}

/// The `{ error, message }` body the route returns on 4xx/5xx.
struct ScamCheckErrorBody: Decodable {
    let error: String
    let message: String?
}
