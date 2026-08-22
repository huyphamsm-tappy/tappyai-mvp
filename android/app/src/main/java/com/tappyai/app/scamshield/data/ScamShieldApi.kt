package com.tappyai.app.scamshield.data

import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Retrofit contract for the Scam Shield check. Built from the shared [retrofit2.Retrofit]
 * (core:network), so it inherits AppLanguageInterceptor — the server therefore returns its refusal
 * messages already in the app's language — and AuthInterceptor, which is what raises the daily
 * quota for a signed-in user exactly as it does on the web.
 */
interface ScamShieldApi {

    @POST("api/scam-shield/check")
    suspend fun check(@Body body: ScamCheckRequestDto): ScamCheckResponseDto
}
