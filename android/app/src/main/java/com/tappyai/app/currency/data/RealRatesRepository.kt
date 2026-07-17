package com.tappyai.app.currency.data

import com.tappyai.app.currency.Rates
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [RatesRepository]. Goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working.
 */
@Singleton
class RealRatesRepository @Inject constructor(
    private val api: RatesApi,
) : RatesRepository {

    override suspend fun getRates(): NetworkResult<Rates> = safeApiCall {
        val dto = api.getRates()
        Rates(values = dto.rates, dateIso = dto.date, fallback = dto.fallback)
    }
}
