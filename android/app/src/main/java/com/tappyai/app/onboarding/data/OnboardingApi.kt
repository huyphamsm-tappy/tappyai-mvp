package com.tappyai.app.onboarding.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Retrofit contract for the onboarding flow, all against endpoints the web already uses.
 *
 * `GET api/config` is public (no auth) and returns the backend-owned product config; onboarding
 * reads only its `onboarding.interests`/`onboarding.cities` catalog (the same lists the web imports
 * from `@/lib/config/product`, exposed to native clients by design — see the route's own doc).
 *
 * `GET api/profile` is reused purely to read the `onboarded` flag for the post-login gate; the web
 * reads that column via a direct Supabase query in its auth-callback redirect, which native clients
 * can't do, so the field is surfaced on this existing endpoint instead.
 *
 * `POST api/onboarding` performs both server-side writes (sets `profiles.onboarded`, seeds memory);
 * the client only sends the picked interests + city.
 */
interface OnboardingApi {

    @GET("api/config")
    suspend fun getConfig(): AppConfigDto

    @GET("api/profile")
    suspend fun getOnboardedStatus(): OnboardedStatusDto

    @POST("api/onboarding")
    suspend fun submitOnboarding(@Body body: OnboardingRequestDto): OnboardingResponseDto
}
