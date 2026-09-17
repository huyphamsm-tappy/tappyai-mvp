package com.tappyai.app.profile.data

import com.tappyai.app.reviews.data.FeedResponseDto
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * The self profile's one collection read the Reviews client lacks: `GET /api/reviews/liked`
 * (`src/app/api/reviews/liked/route.ts`, 2026-09-15) — the bearer's liked reviews, the same shape,
 * gate and order as `/api/reviews/saved` (newest like first, hidden/held posts out, 100 max).
 * Its own interface on purpose: the Reviews client is untouched.
 */
interface ProfileCollectionsApi {
    @GET("api/reviews/liked")
    suspend fun getLiked(): FeedResponseDto

    /**
     * `GET /api/reviews/shared` (`src/app/api/reviews/shared/route.ts`, 2026-09-15) — the reviews
     * the bearer has SHARED (`review_shares`), one per review with its latest share first, the
     * same gate as `/saved`. The history is written by `POST /api/reviews/{id}/share` after a
     * share completed — see [ProfileCollectionsRepository.recordShare].
     */
    @GET("api/reviews/shared")
    suspend fun getShared(): FeedResponseDto

    /** Records one completed share of [reviewId]; the server pins the row to the bearer. */
    @POST("api/reviews/{id}/share")
    suspend fun recordShare(@Path("id") reviewId: String, @Body body: RecordShareRequestDto): RecordShareResponseDto
}

/** `POST /api/reviews/{id}/share` body: which target completed the share (`android:<package>`). */
@Serializable
data class RecordShareRequestDto(val channel: String)

@Serializable
data class RecordShareResponseDto(val shared: Boolean = false, val id: String = "")
