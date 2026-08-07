package com.tappyai.app.scamshield.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Wire shapes for Scam Shield. These mirror `src/lib/scam-shield/types.ts` (web, main @ 11453de)
 * field for field — the client renders what the server produced and computes nothing.
 *
 * The risk engine, providers, scoring, thresholds, evidence generation, recommended actions,
 * the official-brand directory and QR decoding all run server-side. Nothing here re-implements
 * any of it.
 */

/** `POST /api/scam-shield/check` request body — the web sends exactly `{url}`. */
@Serializable
data class ScamShieldCheckRequestDto(
    val url: String,
)

/** `{score, confidence, level}` — `level` is SAFE|LOW|MEDIUM|HIGH|CRITICAL. */
@Serializable
data class ScamShieldRiskDto(
    val score: Int = 0,
    val confidence: Int = 0,
    val level: String = "",
)

@Serializable
data class ScamShieldEvidenceItemDto(
    val source: String = "",
    val category: String = "",
    val finding: String = "",
    /** safe | info | warning | critical */
    val severity: String = "",
    val summary: String = "",
    val detail: String = "",
    /**
     * Free-form per-provider data. The web renders only `source` and `summary`, so this is
     * carried but never displayed — kept so the model does not silently drop a server field.
     */
    val dataPoints: JsonElement? = null,
)

@Serializable
data class ScamShieldEvidenceSummaryDto(
    val criticalCount: Int = 0,
    val warningCount: Int = 0,
    val safeCount: Int = 0,
    val totalSources: Int = 0,
    val respondedSources: Int = 0,
)

@Serializable
data class ScamShieldEvidenceDto(
    val items: List<ScamShieldEvidenceItemDto> = emptyList(),
    val summary: ScamShieldEvidenceSummaryDto? = null,
)

/**
 * A server-authored recommendation. Both labels arrive on every action and the client picks by
 * locale — the same rule as the web (`locale === 'vi' ? action.label_vi : action.label_en`).
 */
@Serializable
data class ScamShieldActionDto(
    /** primary | secondary */
    val priority: String = "secondary",
    val action: String = "",
    val label_vi: String = "",
    val label_en: String = "",
    /** stop | link | phone | flag | warning | search | check */
    val icon: String = "",
)

@Serializable
data class ScamShieldOfficialEntityDto(
    val id: String = "",
    val brand: String = "",
    val category: String = "",
    val domains: List<String> = emptyList(),
    val website: String = "",
    val hotline: String? = null,
    val email: String? = null,
)

/** The full `CheckResult` returned by both `/check` and `/qr`. */
@Serializable
data class ScamShieldResultDto(
    /** url | qr */
    val inputType: String = "",
    val url: String = "",
    val risk: ScamShieldRiskDto = ScamShieldRiskDto(),
    val evidence: ScamShieldEvidenceDto = ScamShieldEvidenceDto(),
    val officialMatch: ScamShieldOfficialEntityDto? = null,
    val actions: List<ScamShieldActionDto> = emptyList(),
    val checkedAt: Long = 0L,
    val cached: Boolean = false,
)

/**
 * Error body shape shared by both endpoints: `{error, message}`, plus `qrText` on `qr_no_url`.
 *
 * `error` is the code the web keys its translation off — see [ScamShieldErrorMessages]. The
 * server's `message` is deliberately NOT shown: the web ignores it too and renders its own
 * localized string, because the server text is English-only.
 */
@Serializable
data class ScamShieldErrorDto(
    val error: String? = null,
    val message: String? = null,
    val qrText: String? = null,
)
