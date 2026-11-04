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

    override suspend fun getPlanAccess(): PlanAccess? =
        when (val result = safeApiCall { api.getMyPlan() }) {
            is NetworkResult.Success -> PlanAccess(
                signedIn = result.data.signedIn,
                state = result.data.subscription?.state,
                planId = result.data.subscription?.plan?.id,
            )
            is NetworkResult.Error -> null
        }
}
