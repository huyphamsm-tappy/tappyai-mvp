package com.tappyai.app.scamshield

/**
 * Domain models for Scam Shield on Android (B09).
 *
 * 🚨 The backend at `POST /api/scam-shield/check` is the ONLY authority on whether a URL is a
 * scam. Nothing in this package scores, classifies or second-guesses a link: it transports the
 * verdict and renders it. Any local heuristic would eventually disagree with the web for the same
 * URL, and a safety feature that answers differently on two screens is worse than one that is
 * absent — which is what this parity gap was.
 */

/** Verdict levels, mirroring `RiskLevel` in `src/lib/scam-shield/types.ts` exactly. */
enum class RiskLevel {
    SAFE,
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL,

    /**
     * 🚨 Not a mild SAFE. The engine reports INCONCLUSIVE when too little of its evidence base
     * responded to stand behind a reassuring answer. It must never be presented in the language or
     * colour of a clean bill of health — see [com.tappyai.app.scamshield.ScamShieldScreen].
     */
    INCONCLUSIVE,

    /** A level this build does not know. Treated as INCONCLUSIVE, never as safe. */
    UNKNOWN,
    ;

    companion object {
        /**
         * Parses the wire value. An unrecognised level — a level the backend adds after this app
         * ships — degrades to [UNKNOWN], which the UI presents like INCONCLUSIVE. Defaulting to
         * SAFE here would turn a future backend change into a silent false reassurance.
         */
        fun fromWire(value: String?): RiskLevel =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) && it != UNKNOWN } ?: UNKNOWN
    }
}

enum class SignalSeverity { SAFE, INFO, WARNING, CRITICAL, UNKNOWN;
    companion object {
        fun fromWire(value: String?): SignalSeverity =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) && it != UNKNOWN } ?: UNKNOWN
    }
}

data class EvidenceItem(
    val source: String,
    val severity: SignalSeverity,
    val summary: String,
    val detail: String,
)

data class RecommendedAction(
    val isPrimary: Boolean,
    /** Already localized by the caller: the backend ships both `label_vi` and `label_en`. */
    val label: String,
)

data class OfficialEntity(
    val brand: String,
    val website: String,
    val hotline: String?,
)

data class ScamCheckResult(
    val url: String,
    val level: RiskLevel,
    val score: Int,
    val confidence: Int,
    val evidence: List<EvidenceItem>,
    val officialMatch: OfficialEntity?,
    val actions: List<RecommendedAction>,
    val cached: Boolean,
)

/**
 * Why a check did not produce a verdict.
 *
 * 🚨 Every one of these is a NON-answer, never a safe answer. The screen renders them as "we could
 * not check this", so a failed check can never read as "this link is fine" — the fail-closed
 * behaviour the web already has.
 */
sealed interface ScamCheckFailure {
    /** The backend refused the request and named a reason (`error` in the JSON body). */
    data class Refused(val code: String, val serverMessage: String?) : ScamCheckFailure

    data object Offline : ScamCheckFailure
    data object Timeout : ScamCheckFailure
    data object Unknown : ScamCheckFailure
}
