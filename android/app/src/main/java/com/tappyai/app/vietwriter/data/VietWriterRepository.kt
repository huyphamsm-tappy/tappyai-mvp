package com.tappyai.app.vietwriter.data

import com.tappyai.core.network.NetworkResult

/** Abstraction over the VietWriter backend. The ViewModel depends on this only — never on
 *  Retrofit/OkHttp or the DTOs. Caption generation itself is entirely server-side. */
interface VietWriterRepository {

    /** Generates a social caption + hashtags for [topic], styled by [platform]/[tone]/[length]
     *  (backend-recognized ids — see [com.tappyai.app.vietwriter.VietWriterOptions]). */
    suspend fun generate(topic: String, platform: String, tone: String, length: String): NetworkResult<VietWriterResult>
}

/** Domain result — the DTO's two strings, unchanged shape (no mapping needed beyond the type). */
data class VietWriterResult(val caption: String, val hashtags: String)
