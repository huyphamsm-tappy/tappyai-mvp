package com.tappyai.app.chat.data

import retrofit2.http.Body
import retrofit2.http.HTTP
import retrofit2.http.POST

/**
 * Retrofit contract for `/api/message-feedback`. Built from the shared [retrofit2.Retrofit]
 * (core:network), so the [com.tappyai.core.network.AuthInterceptor] attaches the Bearer token both
 * verbs require (401 otherwise).
 *
 * DELETE is declared via [HTTP] rather than `@DELETE` because this endpoint reads its identifying
 * fields from a JSON **body**, and Retrofit's `@DELETE` cannot carry one (`hasBody = true` is the
 * supported way to opt in). The backend's DELETE handler does `await req.json()`, so a bodyless
 * DELETE would 500 there — this is not a stylistic choice.
 */
interface MessageFeedbackApi {

    @POST("api/message-feedback")
    suspend fun saveFeedback(@Body body: SaveFeedbackRequestDto): OkFeedbackResponseDto

    @HTTP(method = "DELETE", path = "api/message-feedback", hasBody = true)
    suspend fun deleteFeedback(@Body body: DeleteFeedbackRequestDto): OkFeedbackResponseDto
}
