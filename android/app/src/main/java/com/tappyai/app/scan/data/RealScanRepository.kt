package com.tappyai.app.scan.data

import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [ScanRepository]. Goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working.
 */
@Singleton
class RealScanRepository @Inject constructor(
    private val api: ScanApi,
) : ScanRepository {

    override suspend fun scan(imageBase64: String, mimeType: String): NetworkResult<String> =
        safeApiCall {
            api.scan(ScanRequestDto(imageBase64 = imageBase64, mimeType = mimeType)).text
        }
}
