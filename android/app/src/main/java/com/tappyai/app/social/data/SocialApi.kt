package com.tappyai.app.social.data

import com.tappyai.app.reviews.data.UserSearchResponseDto
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * `GET /api/social/connections?type=following|followers` — the web Following / Followers page's
 * one read (`src/app/api/social/connections/route.ts`). Returns `{ users: [...] }` in exactly the
 * shape `/api/users/search` already returns, so the existing [UserSearchResponseDto] decodes it.
 * A separate interface from [com.tappyai.app.reviews.data.ReviewsApi] on purpose: the Reviews
 * client is untouched, this is the social surface's own client.
 */
interface SocialApi {
    @GET("api/social/connections")
    suspend fun getConnections(@Query("type") type: String): UserSearchResponseDto
}
