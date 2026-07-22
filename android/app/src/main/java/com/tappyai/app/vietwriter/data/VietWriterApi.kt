package com.tappyai.app.vietwriter.data

import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Retrofit contract for VietWriter. Built from the shared [retrofit2.Retrofit] (core:network).
 * Like Translate/Scan, the endpoint needs no `Authorization` header — it rate-limits by client IP
 * (10 requests/60s, tighter than Translate/Scan's daily caps since generation is cheap and quick
 * to abuse in bursts), matching the web (signed-out visitors can generate too).
 */
interface VietWriterApi {

    @POST("api/viet-content")
    suspend fun generate(@Body body: VietWriterRequestDto): VietWriterResponseDto
}
