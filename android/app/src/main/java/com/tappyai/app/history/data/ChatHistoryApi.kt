package com.tappyai.app.history.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * Retrofit contract for `/api/conversations`. Built from the shared [retrofit2.Retrofit]
 * (core:network) so the [com.tappyai.core.network.AuthInterceptor] attaches `Authorization: Bearer …`
 * — every endpoint here requires it (401 otherwise). suspend → coroutine cancellation.
 *
 * GET returns a bare JSON array (Retrofit deserializes it straight into a List). DELETE removes one
 * conversation by `id` query param. POST creates a conversation and returns the inserted row (its
 * `id` is what the chat flow then reuses for PUT and for message feedback); PUT replaces an existing
 * conversation's title+messages. Both mirror the web's own save path exactly (`src/app/chat/page.tsx`
 * POSTs then routes to the new id; `src/app/chat/[id]/ChatConversation.tsx` PUTs thereafter).
 */
interface ChatHistoryApi {

    @GET("api/conversations")
    suspend fun getConversations(): List<ConversationDto>

    @POST("api/conversations")
    suspend fun createConversation(@Body body: CreateConversationRequestDto): ConversationDto

    @PUT("api/conversations")
    suspend fun updateConversation(@Body body: UpdateConversationRequestDto): ConversationDto

    @DELETE("api/conversations")
    suspend fun deleteConversation(@Query("id") id: String): OkResponseDto
}
