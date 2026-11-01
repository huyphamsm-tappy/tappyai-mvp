package com.tappyai.app.membership.data

import retrofit2.http.GET

/** Backend contract for membership status. Built from the shared singleton Retrofit (core:network),
 *  so the auth interceptor attaches the bearer token automatically. */
interface MembershipApi {
    /** Current user's subscription status. Auth-only — returns 401 when signed out. */
    @GET("api/subscription")
    suspend fun getSubscription(): SubscriptionDto

    /** "My plan" (web src/app/api/payments/me): 404 while SUBSCRIPTIONS_ENABLED is off; a visitor gets `signedIn: false`. */
    @GET("api/payments/me")
    suspend fun getMyPlan(): MyPlanDto
}
