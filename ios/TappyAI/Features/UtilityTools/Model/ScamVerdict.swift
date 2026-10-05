import Foundation

/// Scam Shield · the public verdict vocabulary. Three states only, for a message, a link or a QR link; the app never
/// tells a person «safe», and never prints a score or a confidence.
///
/// Source of truth (WEB, `origin/rc/web-uat`): `src/lib/scam-shield/verdict.ts` (`linkVerdict`, commit 65685a7),
/// wording in `src/lib/i18n/scamVerdict.ts` and `docs/uat/SCAM-SHIELD-PARITY.md` §8 (commit 93948b2).
enum ScamVerdict: String, Equatable, Sendable {
    case familiar, suspicious, unrecognized

    /// A LINK (or a link read from a QR): HIGH / CRITICAL = familiar, MEDIUM = suspicious, everything else
    /// (SAFE, LOW, INCONCLUSIVE, unknown) = unrecognized. Same table as `linkVerdict` on the web.
    static func link(level: ScamRiskLevel) -> ScamVerdict {
        switch level {
        case .high, .critical: return .familiar
        case .medium: return .suspicious
        case .safe, .low, .inconclusive, .unknown: return .unrecognized
        }
    }

    /// The `verdict` string the server adds to a link result; nil for anything else (an older server sends none).
    init?(server raw: String?) {
        guard let raw, let v = ScamVerdict(rawValue: raw) else { return nil }
        self = v
    }

    var linkTitleKey: String { "scamVerdict.link.\(rawValue).title" }
    var linkBodyKey: String { "scamVerdict.link.\(rawValue).body" }
}

extension ScamMessageOutcome {
    /// On-device message reading → the three states: a scenario fits = familiar, something looks off = suspicious,
    /// nothing familiar = unrecognized (never «safe»).
    var verdict: ScamVerdict {
        switch self {
        case .matched, .familiar: return .familiar
        case .unsure: return .suspicious
        case .noSigns: return .unrecognized
        }
    }
}
