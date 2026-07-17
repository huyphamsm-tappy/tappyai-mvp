package com.tappyai.app.translate.data

import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [TranslateRepository]. Goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working.
 */
@Singleton
class RealTranslateRepository @Inject constructor(
    private val api: TranslateApi,
) : TranslateRepository {

    override suspend fun translate(text: String, targetLang: String): NetworkResult<String> =
        safeApiCall {
            api.translate(TranslateRequestDto(text = text, targetLang = targetLang)).translation
        }
}
