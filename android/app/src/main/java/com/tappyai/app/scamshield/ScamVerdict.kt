package com.tappyai.app.scamshield

import com.tappyai.app.scamshield.data.ScenarioConfidence

/**
 * The ONLY three things Scam Shield ever says about a message, a link or a QR code (decision A7/A8, 02/10):
 *  - [Familiar]     "Có dấu hiệu lừa đảo quen thuộc"
 *  - [Suspicious]   "Có một số dấu hiệu đáng ngờ"
 *  - [Unrecognized] "Chưa nhận ra dấu hiệu quen thuộc" — which is explicitly NOT "safe".
 * There is no safe state, no score and no confidence figure anywhere in the UI.
 */
internal enum class VerdictKind {
    Familiar,
    Suspicious,
    Unrecognized,
    ;

    companion object {
        /** HIGH/CRITICAL → familiar traits; MEDIUM → some suspicious signs; everything else (SAFE, LOW, INCONCLUSIVE, UNKNOWN) → unrecognised. */
        fun fromRisk(level: RiskLevel): VerdictKind = when (level) {
            RiskLevel.HIGH, RiskLevel.CRITICAL -> Familiar
            RiskLevel.MEDIUM -> Suspicious
            RiskLevel.SAFE, RiskLevel.LOW, RiskLevel.INCONCLUSIVE, RiskLevel.UNKNOWN -> Unrecognized
        }

        fun fromScenario(confidence: ScenarioConfidence): VerdictKind = when (confidence) {
            ScenarioConfidence.High -> Familiar
            ScenarioConfidence.Possible -> Suspicious
        }
    }
}
