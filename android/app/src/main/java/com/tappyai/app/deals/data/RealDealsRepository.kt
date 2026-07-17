package com.tappyai.app.deals.data

import com.tappyai.app.deals.Deal
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Backend-backed [DealsRepository]. Goes through core:network's [safeApiCall] for uniform
 *  error mapping, same as every other feature's Real*Repository. */
@Singleton
class RealDealsRepository @Inject constructor(
    private val api: DealsApi,
) : DealsRepository {

    override suspend fun getDeals(): NetworkResult<List<Deal>> =
        safeApiCall { api.getDeals().deals.map { it.toDomain() } }
}
