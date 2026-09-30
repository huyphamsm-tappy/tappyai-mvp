import Foundation

// User-safety contract (App Store 1.2 — user-generated content): report content or a person, block a
// person, and stop seeing what a blocked person posted. Server: PHASE 8 / Task 17 on `phase8-master`
// (`src/app/api/reports/route.ts`, `src/app/api/users/[id]/block/route.ts`,
// `src/app/api/users/blocks/route.ts`), each behind a server flag that answers 404 while OFF. This side
// is behind the same flags, read from `/api/config` → `p8` (default OFF).

/// Which of the safety surfaces the server has switched on (`AppConfig.p8`). All false until it says so.
struct SafetyFlags: Equatable, Sendable {
    var reports = false
    var userBlocks = false
    var commentModeration = false

    static let off = SafetyFlags()

    init(reports: Bool = false, userBlocks: Bool = false, commentModeration: Bool = false) {
        self.reports = reports; self.userBlocks = userBlocks; self.commentModeration = commentModeration
    }

    init(_ p8: AppConfig.P8?) {
        self.init(reports: p8?.reports ?? false, userBlocks: p8?.userBlocks ?? false,
                  commentModeration: p8?.commentModeration ?? false)
    }

    /// Whether the ⋯ button on someone else's content should open the safety sheet at all.
    var anyEnabled: Bool { reports || userBlocks }
}

/// What can be reported (`POST /api/reports` `target_type`). Clips are reviews.
enum ReportTargetKind: String, Sendable, CaseIterable {
    case review, comment, user

    var titleKey: String { "safety.report.title." + rawValue }
}

/// The server's reason whitelist, in menu order (`REPORT_REASONS` in `src/app/api/reports/route.ts`, a
/// mirror of the CHECK constraint in `20260924_p8_reports_sanctions_audit.sql`).
/// Named apart from Music's `ReportReason` and the review menu's `ReviewReportReason`: three endpoints, three lists.
enum SafetyReportReason: String, CaseIterable, Identifiable, Sendable {
    case spam, harassment, hate, sexual, violence, selfHarm = "self_harm", scam, misinformation, impersonation, other

    var id: String { rawValue }
    var labelKey: String { "safety.reason." + rawValue }
}

/// Everything the sheet needs to know about the thing being reported. `authorId` is the person who
/// posted it, for the block action; nil when unknown (then only the report is offered).
struct SafetyTarget: Identifiable, Equatable, Sendable {
    let kind: ReportTargetKind
    let targetId: String
    let authorId: String?
    let authorName: String?
    /// One line of context shown at the top of the sheet (a post's place, a comment's start).
    let summary: String?

    var id: String { kind.rawValue + ":" + targetId }
}

/// `POST /api/reports` body. `details` is optional and capped by the server at 1000 characters.
struct ReportRequest: Equatable, Sendable {
    static let maxDetails = 1000

    let kind: ReportTargetKind
    let targetId: String
    let reason: SafetyReportReason
    let details: String?

    func jsonBody() throws -> Data {
        var body: [String: String] = ["target_type": kind.rawValue, "target_id": targetId, "reason": reason.rawValue]
        let trimmed = (details ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { body["details"] = String(trimmed.prefix(Self.maxDetails)) }
        return try JSONSerialization.data(withJSONObject: body)
    }
}

/// What the person is told after sending a report. A repeat of a still-open report is a success too.
enum ReportOutcome: Equatable, Sendable {
    case sent
    /// 404 — the server has the feature switched off (or an older server), 403 — anonymous or
    /// restricted account, anything else.
    case unavailable
    case signInRequired
    case tooManyRequests
    case failed

    static func from(_ result: Result<Void, Error>) -> ReportOutcome {
        switch result {
        case .success: return .sent
        case .failure(let error):
            switch error as? AppError {
            case .network(404, _)?: return .unavailable
            case .network(429, _)?: return .tooManyRequests
            case .authentication(.unauthenticated)?, .authentication(.forbidden)?,
                 .authentication(.sessionExpired)?, .authentication(.refreshFailed)?:
                return .signInRequired
            default: return .failed
            }
        }
    }

    var messageKey: String {
        switch self {
        case .sent: return "safety.report.sent"
        case .unavailable: return "safety.error.unavailable"
        case .signInRequired: return "safety.error.signIn"
        case .tooManyRequests: return "safety.error.tooMany"
        case .failed: return "safety.error.failed"
        }
    }
}

/// One row of `GET /api/users/blocks` → `{ blocks: [{ blocked_id, created_at }] }`.
struct BlockEntry: Decodable, Equatable, Sendable, Identifiable {
    let blockedId: String
    let createdAt: String?

    var id: String { blockedId }

    private enum CodingKeys: String, CodingKey { case blockedId, createdAt }

    init(blockedId: String, createdAt: String? = nil) { self.blockedId = blockedId; self.createdAt = createdAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        blockedId = try c.requiredId(forKey: .blockedId)
        createdAt = c.lenient(String.self, forKey: .createdAt)
    }
}

struct BlocksResponse: Decodable, Sendable {
    let blocks: [BlockEntry]

    private enum CodingKeys: String, CodingKey { case blocks }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        blocks = c.lossyArray(BlockEntry.self, forKey: .blocks)
    }
}
