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

    // QR codes are decoded ON THE DEVICE (ZXing, `QrCodes`): the picture is never uploaded, so `POST /api/scam-shield/qr` is not
    // used by the app. Only the LINK a code carries goes to [check] above.

    /**
     * `POST /api/scam-shield/analyze` — the web's third tab, Analyze Message: the message text
     * and/or a link and/or a screenshot (base64 data URL). Spends one shared Tappy AI question
     * when a model is consulted; the route says so in `quota`. Refusals: `invalid_input`,
     * `invalid_image`, `rate_limit`, `daily_limit`, `analyze_failed`.
     */
    @POST("api/scam-shield/analyze")
    suspend fun analyzeMessage(@Body body: MessageAnalysisRequestDto): MessageAnalysisResponseDto

    /**
     * `POST /api/scam-shield/share` — the web's `ScamShareButton`: the server re-runs the (cached, deterministic) link check and publishes a
     * public page `/r/<slug>` from ITS result; nothing typed on the phone is published. 201 `{id, slug, path, url, host, …}`; 422 `not_shareable`.
     */
    @POST("api/scam-shield/share")
    suspend fun share(@Body body: ScamShareRequestDto): ScamShareResponseDto
}
