package com.tappyai.app.scamshield.data

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.Multipart
import retrofit2.http.Part
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

    /**
     * `POST /api/scam-shield/qr` — the web's QR tab: one image (`multipart/form-data`, part name
     * `image`, ≤ 5 MB), decoded server-side, and the URL it carries checked by the same engine.
     * Same `CheckResult` back; refusals name `qr_decode_failed`, `qr_no_url`, `no_image`,
     * `too_large`, `invalid_content_type` in the error body.
     */
    @Multipart
    @POST("api/scam-shield/qr")
    suspend fun checkQr(@Part image: MultipartBody.Part): ScamCheckResponseDto

    /**
     * `POST /api/scam-shield/analyze` — the web's third tab, Analyze Message: the message text
     * and/or a link and/or a screenshot (base64 data URL). Spends one shared Tappy AI question
     * when a model is consulted; the route says so in `quota`. Refusals: `invalid_input`,
     * `invalid_image`, `rate_limit`, `daily_limit`, `analyze_failed`.
     */
    @POST("api/scam-shield/analyze")
    suspend fun analyzeMessage(@Body body: MessageAnalysisRequestDto): MessageAnalysisResponseDto
}
