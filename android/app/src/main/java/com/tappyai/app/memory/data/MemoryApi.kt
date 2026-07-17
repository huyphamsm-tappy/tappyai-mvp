package com.tappyai.app.memory.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH

/**
 * Retrofit contract for `/api/memory`. Built from the shared [retrofit2.Retrofit] (core:network) so
 * the [com.tappyai.core.network.AuthInterceptor] attaches `Authorization: Bearer …`. suspend →
 * coroutine cancellation.
 *
 * GET is auth-optional and never 401s — it returns `{memory:null}` for no-user/error. PATCH (edit)
 * and DELETE (clear) require auth (401 otherwise). POST (extract-from-conversation) is chat-side,
 * not this screen, so it's not wired.
 */
interface MemoryApi {

    @GET("api/memory")
    suspend fun getMemory(): MemoryResponseDto

    @PATCH("api/memory")
    suspend fun patchMemory(@Body body: MemoryPatchDto): OkResponseDto

    @DELETE("api/memory")
    suspend fun deleteMemory(): OkResponseDto
}
