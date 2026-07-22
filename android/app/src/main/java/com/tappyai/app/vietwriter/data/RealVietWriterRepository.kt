package com.tappyai.app.vietwriter.data

import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [VietWriterRepository]. Goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working.
 */
@Singleton
class RealVietWriterRepository @Inject constructor(
    private val api: VietWriterApi,
) : VietWriterRepository {

    override suspend fun generate(topic: String, platform: String, tone: String, length: String): NetworkResult<VietWriterResult> =
        safeApiCall {
            val response = api.generate(VietWriterRequestDto(topic = topic, platform = platform, tone = tone, length = length))
            VietWriterResult(caption = response.caption, hashtags = response.hashtags)
        }
}
