package com.tappyai.app.scamshield.data

import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

/**
 * Retrofit contract for Scam Shield, built from the shared [retrofit2.Retrofit] (core:network).
 *
 * Both endpoints are the ones the web calls, unchanged. Neither requires an `Authorization`
 * header: the backend reads the session if one is present and applies the higher authenticated
 * daily cap, otherwise it falls back to the anonymous per-IP cap. That is the same request the
 * web makes signed-out.
 *
 * `GET /api/scam-shield/directory` is deliberately absent — the web UI never calls it, because
 * `officialMatch` already arrives inside the check result.
 *
 * These return [Response] rather than the body directly, unlike [com.tappyai.app.scan.data.ScanApi],
 * because the web selects its error copy from the JSON body's `error` code, not from the HTTP
 * status — reproducing that needs the error body, which a plain body-typed call discards.
 */
interface ScamShieldApi {

    @POST("api/scam-shield/check")
    suspend fun check(@Body body: ScamShieldCheckRequestDto): Response<ScamShieldResultDto>

    /**
     * Multipart with a single `image` part — byte-identical to the web's
     * `formData.append('image', file)`. The server also accepts a raw octet-stream body; the web
     * uses multipart, so this does too.
     */
    @Multipart
    @POST("api/scam-shield/qr")
    suspend fun checkQr(@Part image: MultipartBody.Part): Response<ScamShieldResultDto>
}
