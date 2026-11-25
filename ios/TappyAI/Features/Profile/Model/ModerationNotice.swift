import Foundation

/// A decision about the signed-in person's OWN content (`GET /api/moderation/decisions`). The
/// server scopes it to the caller; it never carries a reviewer, a reporter or anyone else's case.
struct ModerationNotice: Decodable, Sendable, Identifiable, Hashable {
    enum Outcome: String, Sendable { case warning, contentRemoved = "content_removed", restricted, banned }
    enum AppealState: String, Sendable { case pending, upheld, reversed }

    let id: String
    let createdAt: String
    let ruleGroup: String
    /// Raw outcome; an unknown value from a newer server is shown as a generic notice.
    let outcomeRaw: String
    let restrictDays: Int?
    let strikeExpiresAt: String?
    let appealStatus: String?
    let canAppeal: Bool

    var outcome: Outcome? { Outcome(rawValue: outcomeRaw) }
    var appeal: AppealState? { appealStatus.flatMap(AppealState.init(rawValue:)) }

    enum CodingKeys: String, CodingKey {
        case id
        case createdAt = "created_at"
        case ruleGroup = "rule_group"
        case outcome
        case restrictDays = "restrict_days"
        case strikeExpiresAt = "strike_expires_at"
        case appeal
        case canAppeal = "can_appeal"
    }

    private struct Appeal: Decodable { let status: String? }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.requiredId(forKey: .id)
        createdAt = c.lenient(String.self, forKey: .createdAt, default: "")
        ruleGroup = c.lenient(String.self, forKey: .ruleGroup, default: "")
        outcomeRaw = c.lenient(String.self, forKey: .outcome, default: "")
        restrictDays = c.lenientInt(forKey: .restrictDays)
        strikeExpiresAt = c.lenient(String.self, forKey: .strikeExpiresAt)
        appealStatus = c.lenient(Appeal.self, forKey: .appeal)?.status
        canAppeal = c.lenient(Bool.self, forKey: .canAppeal, default: false)
    }

    /// An appeal needs 10–1000 characters (the server's rule).
    static func isValidAppeal(_ text: String) -> Bool {
        (10...1000).contains(text.trimmingCharacters(in: .whitespacesAndNewlines).count)
    }
}

/// `{ decisions: [...] }`, lossy: one malformed row must not hide the others.
struct ModerationNoticesResponse: Decodable, Sendable {
    let decisions: [ModerationNotice]

    enum CodingKeys: String, CodingKey { case decisions }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        decisions = c.lossyArray(ModerationNotice.self, forKey: .decisions)
    }
}
