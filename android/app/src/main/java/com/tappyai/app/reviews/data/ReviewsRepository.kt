package com.tappyai.app.reviews.data

import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the Reviews backend. ViewModels depend on this, never on Retrofit/OkHttp or
 * the DTOs — every method returns already-mapped domain types wrapped in [NetworkResult] so the
 * caller branches on success/typed-error without touching raw exceptions.
 *
 * Only actions with an existing UI trigger are exposed. The backend also supports post-comment,
 * follow, media upload, delete/hide and watch-time telemetry, but the current (unchanged) UI has
 * no affordance to invoke them, so they're intentionally absent rather than added as dead code.
 */
interface ReviewsRepository {

    /**
     * One page of the feed (or a filtered slice when [userId]/[search] is set). Backend caps
     * [limit] at 20; end-of-feed is when the returned list size is < [limit].
     */
    suspend fun getFeed(
        page: Int,
        limit: Int,
        sort: String? = "latest",
        userId: String? = null,
        search: String? = null,
    ): NetworkResult<List<Review>>

    /** Toggles like; returns the new liked state. Backend returns no count — caller adjusts locally. */
    suspend fun toggleLike(reviewId: String): NetworkResult<Boolean>

    /** Toggles save; returns the new saved state. */
    suspend fun toggleSave(reviewId: String): NetworkResult<Boolean>

    suspend fun getComments(reviewId: String): NetworkResult<List<ReviewComment>>

    suspend fun getUserProfile(userId: String): NetworkResult<ReviewProfile>

    /** Toggles follow on [userId] (POST /api/users/{id}/follow, no body). Returns the new following
     *  state. Caller adjusts the follower count locally (±1); the backend also returns the count. */
    suspend fun toggleFollow(userId: String): NetworkResult<Boolean>

    suspend fun getNotifications(): NetworkResult<List<ReviewGroupedNotification>>

    /** [musicTrackId], when present, attaches a sound picked via Sound Detail's "Use this sound"
     *  (`POST /api/reviews`'s `music` field, `origin: 'attached'`) — matches the web's own
     *  attach-an-existing-track flow, independent of whether real media is attached. */
    suspend fun createReview(
        placeId: String,
        placeName: String,
        body: String,
        rating: Int?,
        musicTrackId: String? = null,
    ): NetworkResult<Unit>

    /**
     * The tapped review, if it was served by a previous feed/search/profile fetch. There is no
     * single-review GET endpoint, so the detail screen resolves its review from this in-memory
     * cache. Returns null on a cache miss (e.g. cold deep-link) — the caller shows an empty state.
     */
    fun getCachedReview(reviewId: String): Review?

    /** The caller's own reviews, including hidden ones — backs the My Reviews screen. */
    suspend fun getMine(): NetworkResult<List<Review>>

    /** Hides or unhides one of the caller's own reviews. */
    suspend fun setHidden(reviewId: String, hidden: Boolean): NetworkResult<Unit>

    /** Deletes one of the caller's own reviews. */
    suspend fun deleteReview(reviewId: String): NetworkResult<Unit>
}
