import SwiftUI

/// How a verdict looks — shared by the link check, the QR check and the message check, so one vocabulary of three
/// states (familiar / suspicious / unrecognized, `ScamVerdict`) is used everywhere. Never «safe».
///
/// 🚨 Exhaustive over `ScamRiskLevel`, no `default`: a new level stops compiling here until it is given a deliberate
/// look. «Unknown» and «inconclusive» are neutral slate — never the green shield.
enum ScamShieldLevelCopy {
    static let slate = Color(red: 0.39, green: 0.45, blue: 0.55)

    static func color(_ level: ScamRiskLevel) -> Color {
        switch level {
        case .safe: return Color(red: 0.09, green: 0.64, blue: 0.29)
        case .low: return Color(red: 0.15, green: 0.39, blue: 0.92)
        case .medium: return Color(red: 0.79, green: 0.54, blue: 0.02)
        case .high: return Color(red: 0.92, green: 0.35, blue: 0.05)
        case .critical: return Color(red: 0.86, green: 0.15, blue: 0.15)
        case .inconclusive, .unknown: return slate
        }
    }

    /// The three public states (WEB 65685a7): familiar = orange-red, suspicious = amber, unrecognized = neutral slate.
    /// Never green: nothing the app says is «safe».
    static func color(_ verdict: ScamVerdict) -> Color {
        switch verdict {
        case .familiar: return Color(red: 0.92, green: 0.35, blue: 0.05)
        case .suspicious: return Color(red: 0.79, green: 0.54, blue: 0.02)
        case .unrecognized: return slate
        }
    }

    static func glyph(_ verdict: ScamVerdict) -> String {
        switch verdict {
        case .familiar: return "xmark.shield.fill"
        case .suspicious: return "exclamationmark.shield.fill"
        case .unrecognized: return "shield.lefthalf.filled.slash"
        }
    }

    /// Whether the link may be opened at all without a second, explicit confirmation (it always asks first).
    static func isDangerous(_ level: ScamRiskLevel) -> Bool { level == .high || level == .critical }
}
