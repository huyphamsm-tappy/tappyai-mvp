package com.tappyai.app.membership.data

import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RealMembershipRepository @Inject constructor(
    private val api: MembershipApi,
) : MembershipRepository {

    override suspend fun getStatus(): NetworkResult<MembershipStatus> = safeApiCall {
        val dto = api.getSubscription()
        MembershipStatus(
            isPro = dto.isPro,
            remaining = dto.remaining,
            freeDailyLimit = dto.freeDailyLimit,
        )
    }
}
