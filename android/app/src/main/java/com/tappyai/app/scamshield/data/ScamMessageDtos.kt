package com.tappyai.app.scamshield.data

import kotlinx.serialization.Serializable

/**
 * `POST /api/scam-shield/analyze` — Analyze Message (web `lib/scam-shield/message/types.ts`,
 * `ScamMessageResult.tsx`), 2026-09-17. The request is the web's own JSON: a message and/or a
 * link and/or a screenshot as a base64 data URL; the response is `MessageAnalysisResult` plus the
 * route's `quota` block (the ONE shared Tappy AI question pool). Same six-level vocabulary as the
 * URL verdict. Nothing is scored on the phone.
 */
@Serializable
data class MessageAnalysisRequestDto(
    val text: String? = null,
    val url: String? = null,
    val imageBase64: String? = null,
    val mimeType: String? = null,
)

@Serializable
data class MessageRiskDto(val level: String = "", val score: Int = 0, val confidence: Int = 0)

@Serializable
data class MessageSignalDto(val type: String = "", val severity: String = "low", val explanation: String = "", val source: String = "")

@Serializable
data class UrlCheckSummaryDto(
    val url: String = "",
    /** `checked | failed | skipped`. */
    val status: String = "",
    val level: String? = null,
    val score: Int? = null,
    val confidence: Int? = null,
)

@Serializable
data class AdviceItemDto(
    val code: String = "",
    @kotlinx.serialization.SerialName("label_vi") val labelVi: String = "",
    @kotlinx.serialization.SerialName("label_en") val labelEn: String = "",
)

@Serializable
data class MessageAdviceDto(val doNot: List<AdviceItemDto> = emptyList(), val doNow: List<AdviceItemDto> = emptyList())

@Serializable
data class AnalysisMetaDto(
    val tier: Int = 0,
    /** `used | not_needed | quota_exhausted | unavailable | failed`. */
    val aiStatus: String = "",
    val provider: String? = null,
    val modelRole: String? = null,
)

@Serializable
data class QuotaDto(
    /** `user | anon | guest`. */
    val kind: String = "",
    val limit: Int = 0,
    /** `day | lifetime`. */
    val period: String = "day",
    val used: Int? = null,
    val remaining: Int? = null,
    val exhausted: Boolean = false,
    val pro: Boolean = false,
)

@Serializable
data class MessageAnalysisResponseDto(
    val inputType: String = "message",
    val risk: MessageRiskDto = MessageRiskDto(),
    val scamType: String? = null,
    val attackGoal: String? = null,
    val signals: List<MessageSignalDto> = emptyList(),
    val requestedActions: List<String> = emptyList(),
    val urlChecks: List<UrlCheckSummaryDto> = emptyList(),
    val advice: MessageAdviceDto? = null,
    val reasoningSummary: String = "",
    val analysis: AnalysisMetaDto? = null,
    val extractedText: String? = null,
    val analyzedAt: Long = 0L,
    val quota: QuotaDto? = null,
)
