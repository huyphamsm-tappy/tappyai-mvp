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
    /** The backend's glyph key (`stop`, `link`, `phone`, `flag`, `warning`, `search`, `check`); blank → a generic alert. */
    val icon: String,
    /** Already localized by the caller: the backend ships both `label_vi` and `label_en`. */
    val label: String,
)

/**
 * One row of "recent checks, on this device" (web `lib/scam-shield/history.ts`).
 *
 * 🚨 NOT A SECURITY RECORD. It is written only AFTER the engine returned a real verdict, stores
 * the three fields the list renders and nothing else (no score, no evidence, no actions, no
 * official match), and a row is never presented as a current verdict — tapping one re-runs the
 * check. Per device, never synced.
 */
data class ScamCheckHistoryEntry(
    /** The URL as the engine normalised it. */
    val url: String,
    /** The level the engine assigned AT THE TIME. */
    val level: RiskLevel,
    /** Epoch ms of the check. */
    val checkedAt: Long,
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

// ── Analyze Message (web `lib/scam-shield/message/types.ts` → `MessageAnalysisResult` + `quota`) ──

data class MessageSignal(
    val type: String,
    /** `low | medium | high`. */
    val severity: String,
    val explanation: String,
)

/** One link the message carried, as the engine saw it; `checked = false` renders "Chưa kiểm tra được". */
data class MessageUrlCheck(val url: String, val checked: Boolean, val level: RiskLevel?)

/** Already localized by the caller: the backend ships both `label_vi` and `label_en`. */
data class AdviceItem(val code: String, val label: String)

/** The route's `quota` block — the ONE shared Tappy AI question pool, never a Scam Shield allowance. */
data class MessageQuota(
    val kind: String,
    val limit: Int,
    /** `day | lifetime`. */
    val period: String,
    val used: Int?,
    val remaining: Int?,
    val exhausted: Boolean,
    val pro: Boolean,
)

/**
 * A message verdict. The same six-level vocabulary as [ScamCheckResult]; the body is about what
 * the sender is trying to make the reader DO. NOT written to the device history — that list is a
 * list of links, and a message is not a link.
 */
data class MessageAnalysis(
    val level: RiskLevel,
    val score: Int,
    val confidence: Int,
    /** A `SCAM_TYPES` key (`bank_phishing`, …) or null. */
    val scamType: String?,
    /** An `ATTACK_GOALS` key (`payment_fraud`, …) or null. */
    val attackGoal: String?,
    val signals: List<MessageSignal>,
    val requestedActions: List<String>,
    val urlChecks: List<MessageUrlCheck>,
    val doNot: List<AdviceItem>,
    val doNow: List<AdviceItem>,
    val reasoningSummary: String,
    /** `used | not_needed | quota_exhausted | unavailable | failed`. */
    val aiStatus: String,
    val extractedText: String?,
    val quota: MessageQuota?,
)
