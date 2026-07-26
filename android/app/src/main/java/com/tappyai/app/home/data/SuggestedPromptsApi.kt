package com.tappyai.app.home.data

import kotlinx.serialization.Serializable
import retrofit2.http.GET

/**
 * `GET /api/suggested-prompts` — time-of-day-aware chat prompt suggestions (web parity, the same
 * `getDynamicPrompts` output the web computes). Public: personalizes off the caller's memory/gender
 * when signed in (Bearer), falls back to generic prompts otherwise. Each prompt carries both a
 * Vietnamese [SuggestedPromptDto.text] and an English [SuggestedPromptDto.textEn].
 */
interface SuggestedPromptsApi {
    @GET("api/suggested-prompts")
    suspend fun getSuggestedPrompts(): SuggestedPromptsResponseDto
}

@Serializable
data class SuggestedPromptsResponseDto(
    val prompts: List<SuggestedPromptDto> = emptyList(),
)

@Serializable
data class SuggestedPromptDto(
    val text: String = "",
    val textEn: String = "",
    val emoji: String = "",
    val category: String = "",
)
