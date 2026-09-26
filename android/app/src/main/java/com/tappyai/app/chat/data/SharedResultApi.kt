package com.tappyai.app.chat.data

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Retrofit contract for the G1 share-out endpoints — the same two calls the web's
 * `SharePreviewDialog` makes (`src/components/share/SharePreviewDialog.tsx`):
 *
 *   POST api/shared-results/preview  → the sanitized payload the public will see
 *   POST api/shared-results          → creates the frozen public page, returns its URL
 *
 * Built from the shared [retrofit2.Retrofit] (auth interceptor, base URL), like
 * [MessageFeedbackApi]. The server reads the answer back from the caller's OWN
 * conversation (RLS) — the client names a conversation and an index, never sends text.
 */
interface SharedResultApi {

    @POST("api/shared-results/preview")
    suspend fun preview(@Body body: ShareRequestDto): SharePreviewResponseDto

    @POST("api/shared-results")
    suspend fun publish(@Body body: ShareRequestDto): SharePublishResponseDto
}

/** Wire body for both calls — mirrors `parseShareRequest` on the server. */
@Serializable
data class ShareRequestDto(
    val conversationId: String,
    val messageIndex: Int,
    val title: String? = null,
    val locale: String? = null,
)

/** Only the fields the preview shows. Unknown keys are ignored by the shared Json config. */
@Serializable
data class SharePreviewPayloadDto(
    val title: String = "",
    val query: String = "",
    val body: String = "",
    val images: List<String> = emptyList(),
    val buttons: List<SharePreviewButtonDto> = emptyList(),
)

@Serializable
data class SharePreviewButtonDto(val label: String = "", val url: String = "")

@Serializable
data class SharePreviewResponseDto(val payload: SharePreviewPayloadDto, val listed: Boolean = true)

@Serializable
data class SharePublishResponseDto(
    val id: String,
    val slug: String,
    val url: String,
    val title: String = "",
    val domain: String = "",
    val listed: Boolean = true,
)
