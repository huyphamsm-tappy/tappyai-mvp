package com.tappyai.app.scamshield.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire shapes for `POST /api/scam-shield/check` — a subset of the backend's `CheckResult`
 * (`src/lib/scam-shield/types.ts`). Fields the phone does not render (raw provider signals, the
 * per-source data points, timing counters) are deliberately not modelled; `ignoreUnknownKeys` in
 * the shared Json drops them.
 *
 * Every field has a default so a backend that adds or omits something cannot fail the whole decode
 * — the alternative is a safety check that reports "couldn't check" because of a cosmetic field.
 */

@Serializable
data class ScamCheckRequestDto(val url: String)

@Serializable
data class ScamCheckResponseDto(
    val url: String = "",
    val risk: RiskDto = RiskDto(),
    val evidence: EvidenceReportDto = EvidenceReportDto(),
    val officialMatch: OfficialEntityDto? = null,
    val actions: List<RecommendedActionDto> = emptyList(),
    val cached: Boolean = false,
)

@Serializable
data class RiskDto(
    val score: Int = 0,
    val confidence: Int = 0,
    /**
     * 🚨 Empty — not "SAFE" — when the backend omits it. `RiskLevel.fromWire` maps anything it does
     * not recognise to UNKNOWN, which the UI shows as an unresolved check.
     */
    val level: String = "",
)

@Serializable
data class EvidenceReportDto(
    val items: List<EvidenceItemDto> = emptyList(),
)

@Serializable
data class EvidenceItemDto(
    val source: String = "",
    val severity: String = "",
    val summary: String = "",
    val detail: String = "",
)

@Serializable
data class RecommendedActionDto(
    val priority: String = "secondary",
    @SerialName("label_vi") val labelVi: String = "",
    @SerialName("label_en") val labelEn: String = "",
)

@Serializable
data class OfficialEntityDto(
    val brand: String = "",
    val website: String = "",
    val hotline: String? = null,
)

/** The `{ error, message }` body the route returns on 4xx/5xx. */
@Serializable
data class ScamCheckErrorDto(
    val error: String = "",
    val message: String? = null,
)
