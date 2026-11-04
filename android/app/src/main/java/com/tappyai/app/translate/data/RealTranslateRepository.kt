package com.tappyai.app.translate.data

import com.tappyai.app.ProductFlags
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [TranslateRepository]. Goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working.
 *
 * Translate is hidden ([ProductFlags.SHOW_TRANSLATE], owner decision 2026-10-25): while [enabled] is
 * false nothing is sent and the answer is the same 404 `not_available` the server gives. Hilt uses
 * the secondary constructor, so the product flag decides; a test passes [enabled] directly.
 */
@Singleton
class RealTranslateRepository internal constructor(
    private val api: TranslateApi,
    private val enabled: Boolean,
) : TranslateRepository {

    @Inject
    constructor(api: TranslateApi) : this(api, ProductFlags.SHOW_TRANSLATE)

    override suspend fun translate(text: String, targetLang: String): NetworkResult<String> {
        if (!enabled) return NetworkResult.Error(NetworkError.Http(code = 404, message = "not_available"))
        return safeApiCall {
            api.translate(TranslateRequestDto(text = text, targetLang = targetLang)).translation
        }
    }
}
