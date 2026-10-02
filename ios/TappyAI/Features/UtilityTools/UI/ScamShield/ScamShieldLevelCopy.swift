import SwiftUI

/// How a risk level looks and is worded — shared by the link check, the QR check and the message analysis, so one
/// vocabulary (an-toàn / nghi ngờ / nguy hiểm / chưa đủ thông tin) is used everywhere.
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

    static func levelKey(_ level: ScamRiskLevel) -> String {
        switch level {
        case .safe: return "scamShield.level.safe"
        case .low: return "scamShield.level.low"
        case .medium: return "scamShield.level.medium"
        case .high: return "scamShield.level.high"
        case .critical: return "scamShield.level.critical"
        case .inconclusive, .unknown: return "scamShield.level.inconclusive"
        }
    }

    /// Whether the link may be opened at all without a second, explicit confirmation (it always asks first).
    static func isDangerous(_ level: ScamRiskLevel) -> Bool { level == .high || level == .critical }
}
