package com.tappyai.app.chat.data

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Backend contract for the read-aloud language decision (`/api/voice/language`).
 *
 * Built from the shared singleton Retrofit (core:network), so the existing session rides along —
 * this introduces no second auth mechanism and carries no credential of its own. The endpoint is
 * authenticated and rate-limited server-side.
 *
 * It returns a decision only: no audio, no voice name, no cost. Android keeps using its on-device
 * TextToSpeech engine; all it needed from the server was which language to set.
 */
interface VoiceLanguageApi {
    @POST("api/voice/language")
    suspend fun detectLanguage(@Body body: VoiceLanguageRequestDto): VoiceLanguageResponseDto
}

@Serializable
data class VoiceLanguageRequestDto(
    val text: String,
)

/**
 * `language` is null when the server cannot name a language it supports, and `speakable` mirrors
 * that. Both are read: a client that trusted only one of them would be relying on the two never
 * disagreeing.
 */
@Serializable
data class VoiceLanguageResponseDto(
    val language: String? = null,
    val speakable: Boolean = false,
)
