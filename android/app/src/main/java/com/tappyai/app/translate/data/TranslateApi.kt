package com.tappyai.app.translate.data

import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Retrofit contract for Translate. Built from the shared [retrofit2.Retrofit] (core:network).
 * Unlike most other API interfaces in this app, the endpoint needs no `Authorization` header — it
 * rate-limits by client IP, not by user (matches the web, which lets signed-out visitors
 * translate too) — [com.tappyai.core.network.AuthInterceptor] simply has no token to attach when
 * signed out, which is fine here since the backend doesn't require one.
 */
interface TranslateApi {

    @POST("api/translate")
    suspend fun translate(@Body body: TranslateRequestDto): TranslateResponseDto
}
