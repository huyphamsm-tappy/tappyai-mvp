package com.tappyai.app.chat.data

import kotlinx.serialization.Serializable
import retrofit2.http.GET

/**
 * Backend contract for the dynamic, time/memory/gender-aware chat starter prompts (the web's
 * `/api/suggested-prompts`, shown on the general-category welcome). Built from the shared singleton
 * Retrofit (core:network), so auth rides along for the memory/gender personalization.
 */
interface SuggestedPromptsApi {
    @GET("api/suggested-prompts")
    suspend fun getSuggestedPrompts(): SuggestedPromptsResponseDto
}

@Serializable
data class SuggestedPromptsResponseDto(
    val prompts: List<SuggestedPromptDto> = emptyList(),
)

/** Only [text]/[textEn] are consumed; the wire also carries category/emoji/gradient, dropped by the
 *  shared lenient Json (ignoreUnknownKeys). */
@Serializable
data class SuggestedPromptDto(
    val text: String = "",
    val textEn: String = "",
)
