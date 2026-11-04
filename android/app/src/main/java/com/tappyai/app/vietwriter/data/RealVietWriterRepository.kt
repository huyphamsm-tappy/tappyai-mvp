package com.tappyai.app.vietwriter.data

import com.tappyai.app.ProductFlags
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [VietWriterRepository]. Goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working.
 *
 * Viết nội dung is hidden ([ProductFlags.SHOW_VIET_CONTENT], owner decision 2026-10-25): while
 * [enabled] is false nothing is sent and the answer is the same 404 `not_available` the server gives.
 * Hilt uses the secondary constructor, so the product flag decides; a test passes [enabled] directly.
 */
@Singleton
class RealVietWriterRepository internal constructor(
    private val api: VietWriterApi,
    private val enabled: Boolean,
) : VietWriterRepository {

    @Inject
    constructor(api: VietWriterApi) : this(api, ProductFlags.SHOW_VIET_CONTENT)

    override suspend fun generate(topic: String, platform: String, tone: String, length: String): NetworkResult<VietWriterResult> {
        if (!enabled) return NetworkResult.Error(NetworkError.Http(code = 404, message = "not_available"))
        return safeApiCall {
            val response = api.generate(VietWriterRequestDto(topic = topic, platform = platform, tone = tone, length = length))
            VietWriterResult(caption = response.caption, hashtags = response.hashtags)
        }
    }
}
