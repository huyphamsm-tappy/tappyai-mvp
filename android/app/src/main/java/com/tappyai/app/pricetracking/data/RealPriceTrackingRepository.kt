package com.tappyai.app.pricetracking.data

import com.tappyai.app.pricetracking.PriceWatch
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [PriceTrackingRepository]. Both calls go through core:network's [safeApiCall],
 * which maps HttpException/IOException/timeout/serialization into [NetworkResult.Error] and
 * rethrows CancellationException so coroutine cancellation keeps working. DTO→domain mapping
 * happens here.
 */
@Singleton
class RealPriceTrackingRepository @Inject constructor(
    private val api: PriceTrackingApi,
) : PriceTrackingRepository {

    override suspend fun getWatches(): NetworkResult<List<PriceWatch>> =
        safeApiCall { api.getWatches().watches.map { it.toDomain() } }

    override suspend fun deleteWatch(id: String): NetworkResult<Unit> =
        safeApiCall {
            api.deleteWatch(DeleteWatchRequestDto(id))
            Unit
        }
}
