package com.tappyai.app.preferences.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT

/**
 * Retrofit contract for `/api/preferences`. Built from the shared [retrofit2.Retrofit] (core:network)
 * so the [com.tappyai.core.network.AuthInterceptor] attaches `Authorization: Bearer …` — all three
 * require it (401 otherwise). suspend → coroutine cancellation.
 *
 * Reads via GET; saving is split by the backend into PUT (structured: budget/cuisine/dietary) and
 * POST (the freeform preferences list), both upserting the same `user_preferences` row on distinct
 * columns.
 */
interface PreferencesApi {

    @GET("api/preferences")
    suspend fun getPreferences(): PreferencesResponseDto

    @PUT("api/preferences")
    suspend fun putStructured(@Body body: UpdateStructuredRequestDto): OkResponseDto

    @POST("api/preferences")
    suspend fun postPreferences(@Body body: UpdatePreferencesRequestDto): OkResponseDto
}
