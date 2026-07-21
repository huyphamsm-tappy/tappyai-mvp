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
        following: Boolean = false,
    ): NetworkResult<List<Review>>

    /** Toggles like; returns the new liked state. Backend returns no count — caller adjusts locally. */
    suspend fun toggleLike(reviewId: String): NetworkResult<Boolean>

    /** Toggles save; returns the new saved state. */
    suspend fun toggleSave(reviewId: String): NetworkResult<Boolean>

    suspend fun getComments(reviewId: String): NetworkResult<List<ReviewComment>>

    /** Posts a comment on [reviewId] and returns the created comment (already mapped to domain).
     *  [parentId] replies to another comment (one-level thread); null posts a top-level comment.
     *  The backend enforces 1–300 chars and rate-limits (10/min); a validation or rate-limit
     *  failure surfaces as a typed [NetworkResult.Error]. */
    suspend fun postComment(reviewId: String, body: String, parentId: String? = null): NetworkResult<ReviewComment>

    /** Deletes one of the caller's own comments; returns the review's updated comment count. */
    suspend fun deleteComment(reviewId: String, commentId: String): NetworkResult<Int>

    /** Sets (or changes) the caller's single reaction ([reactionKey]) on [commentId]. One per user. */
    suspend fun setReaction(commentId: String, reactionKey: String): NetworkResult<Unit>

    /** Removes the caller's reaction from [commentId]. */
    suspend fun removeReaction(commentId: String): NetworkResult<Unit>

    suspend fun getUserProfile(userId: String): NetworkResult<ReviewProfile>

    /** Searches users by name (or exact email/phone) for the Explore "Users" search mode. */
    suspend fun searchUsers(query: String): NetworkResult<List<UserSearchResult>>

    /** Toggles follow on [userId] (POST /api/users/{id}/follow, no body). Returns the new following
     *  state. Caller adjusts the follower count locally (±1); the backend also returns the count. */
    suspend fun toggleFollow(userId: String): NetworkResult<Boolean>

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
        // Web parity: the composer's MusicSelectionPanel lets the user set a start offset + volume
        // for the attached track; sent through in the `music` payload (defaults = whole track, full).
        musicStartSec: Int = 0,
        musicVolume: Double = 1.0,
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

    /** Records video watch analytics for [reviewId] (POST /api/reviews/{id}/interact). Fire-and-
     *  forget — callers ignore the result; a failure never affects playback. */
    suspend fun recordInteraction(reviewId: String, watchSeconds: Int, completionRate: Double): NetworkResult<Unit>
}
