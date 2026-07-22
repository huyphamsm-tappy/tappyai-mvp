package com.tappyai.app.scan.data

import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Retrofit contract for Scan. Built from the shared [retrofit2.Retrofit] (core:network). Like
 * Translate, the endpoint needs no `Authorization` header — it rate-limits by client IP
 * (20 scans/day), not by user, matching the web (signed-out visitors can scan too).
 */
interface ScanApi {

    @POST("api/scan")
    suspend fun scan(@Body body: ScanRequestDto): ScanResponseDto
}
