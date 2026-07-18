package com.tappyai.app.reviews.data

import com.tappyai.core.network.NetworkResult

/** A pasted external clip (YouTube/TikTok/Facebook) attached to a review being composed.
 *  [thumbnailUrl] is best-effort (may be null when the provider exposes no poster frame). */
data class LinkAttachment(
    val sourceType: String,
    val sourceUrl: String,
    val thumbnailUrl: String?,
)

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

    /** Posts a comment on [reviewId] and returns the created comment (already mapped to domain).
     *  The backend enforces 1–300 chars and rate-limits (10/min); a validation or rate-limit
     *  failure surfaces as a typed [NetworkResult.Error]. */
    suspend fun postComment(reviewId: String, body: String): NetworkResult<ReviewComment>

    suspend fun getUserProfile(userId: String): NetworkResult<ReviewProfile>

    suspend fun getNotifications(): NetworkResult<List<ReviewGroupedNotification>>

    /**
     * Uploads a single review photo (multipart `POST /api/reviews/upload`) and returns its public
     * Blob URL on success. [mimeType] must be a real image type; the backend re-sniffs the bytes
     * and rejects anything else (≤5MB). Callers collect the URLs and pass them to [createReview]
     * as [photos] — mirroring the web, where photo upload and review creation are two steps.
     */
    suspend fun uploadReviewPhoto(bytes: ByteArray, mimeType: String): NetworkResult<String>

    /**
     * Best-effort thumbnail URL for a pasted TikTok/Facebook link, via GET /api/explore/oembed.
     * Returns null when the provider exposes none — never fatal; the review can post without a
     * poster frame. YouTube thumbnails are derived client-side and don't call this.
     */
    suspend fun getLinkThumbnail(url: String): NetworkResult<String?>

    /** [musicTrackId], when present, attaches a sound picked via Sound Detail's "Use this sound"
     *  (`POST /api/reviews`'s `music` field, `origin: 'attached'`) — matches the web's own
     *  attach-an-existing-track flow, independent of whether real media is attached.
     *  [photos] carries public Blob URLs from [uploadReviewPhoto] (max 6, backend-capped).
     *  [link], when present, attaches an external clip (YouTube/TikTok/Facebook) — the web sends
     *  content_type='video', media_url=source_url, source_type, source_url and a best-effort thumb. */
    suspend fun createReview(
        placeId: String,
        placeName: String,
        body: String,
        rating: Int?,
        musicTrackId: String? = null,
        photos: List<String>? = null,
        link: LinkAttachment? = null,
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
