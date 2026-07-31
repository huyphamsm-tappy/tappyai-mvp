package com.tappyai.app.reviews.data

import android.net.Uri
import com.tappyai.core.network.NetworkResult

/** AI enrichment for a just-uploaded video — hashtags to attach and a suggested caption to fill an
 *  empty body, mirroring the web composer's post-upload `/api/explore/process` result. */
data class AiEnrichment(
    val hashtags: List<String> = emptyList(),
    val caption: String = "",
)

/** Result of posting a comment: the inserted comment (with author profile) and the backend's
 *  recomputed exact comment count for the review. */
data class PostedComment(
    val comment: ReviewComment?,
    val count: Int,
)

/** Result of toggling follow on a user: the new following state + the target's follower count. */
data class FollowResult(
    val following: Boolean,
    val followerCount: Int,
)

/** oEmbed poster + title for a link-sourced review (TikTok/Facebook). */
data class OembedResult(
    val thumbnailUrl: String,
    val title: String,
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
        following: Boolean? = null,
    ): NetworkResult<List<Review>>

    /** Toggles like; returns the new liked state. Backend returns no count — caller adjusts locally. */
    suspend fun toggleLike(reviewId: String): NetworkResult<Boolean>

    /** Toggles save; returns the new saved state. */
    suspend fun toggleSave(reviewId: String): NetworkResult<Boolean>

    suspend fun getComments(reviewId: String): NetworkResult<List<ReviewComment>>

    /** Posts a comment (or a reply when [parentId] is non-null); returns the inserted comment (with
     *  author profile) + the new exact count. */
    suspend fun postComment(reviewId: String, body: String, parentId: String? = null): NetworkResult<PostedComment>

    /** Deletes one of the caller's own comments; returns the new exact count. */
    suspend fun deleteComment(reviewId: String, commentId: String): NetworkResult<Int>

    /** Adds/switches the caller's reaction on a comment (one of the 6 allowed keys). */
    suspend fun reactToComment(commentId: String, reaction: String): NetworkResult<Unit>

    /** Removes the caller's reaction from a comment. */
    suspend fun removeCommentReaction(commentId: String): NetworkResult<Unit>

    /** Searches users by name (Explore Users segment). */
    suspend fun searchUsers(query: String): NetworkResult<List<ReviewProfile>>

    suspend fun getUserProfile(userId: String): NetworkResult<ReviewProfile>

    /** Toggles follow/unfollow for [userId]; returns the new state + the target's follower count. */
    suspend fun followUser(userId: String): NetworkResult<FollowResult>

    suspend fun getNotifications(): NetworkResult<List<ReviewGroupedNotification>>

    /** Mark all unread notifications read (web parity: opening the inbox marks all read). */
    suspend fun markAllNotificationsRead(): NetworkResult<Unit>

    /** [musicTrackId], when present, attaches a sound picked via Sound Detail's "Use this sound"
     *  (`POST /api/reviews`'s `music` field, `origin: 'attached'`) — matches the web's own
     *  attach-an-existing-track flow, independent of whether real media is attached. */
    suspend fun createReview(
        placeId: String,
        placeName: String,
        body: String,
        rating: Int?,
        musicTrackId: String? = null,
        photos: List<String>? = null,
        mediaUrl: String? = null,
        thumbnail: String? = null,
        contentType: String? = null,
        sourceType: String? = null,
        sourceUrl: String? = null,
        durationSec: Double? = null,
        hashtags: List<String>? = null,
    ): NetworkResult<Unit>

    /** Post-upload AI enrichment for a video (hashtags + suggested caption). Non-blocking at the
     *  call site — a failure is fine and the post proceeds without tags, matching the web.
     *  [title] is sent for URL-sourced reviews (the web's `triggerUrlAI` passes it). */
    suspend fun processVideoAi(thumbnailUrl: String?, caption: String?, title: String? = null): NetworkResult<AiEnrichment>

    /** Uploads one photo for a photo review (multipart → `/api/reviews/upload`); returns its Blob URL. */
    suspend fun uploadReviewPhoto(uri: Uri): NetworkResult<String>

    /** Fetches the oEmbed poster + title for a TikTok/Facebook link (YouTube is built client-side). */
    suspend fun oembed(url: String): NetworkResult<OembedResult>

    /**
     * Uploads a picked review video via the Vercel Blob client-upload handshake (mint token at
     * `POST /api/upload/video`, then PUT the bytes directly to Blob — same as the web), streaming
     * from [uri] with progress. Returns the final Vercel Blob URL to put in the review's `media_url`.
     * [onProgress] reports 0f..1f as bytes are sent (for the composer's progress bar).
     */
    suspend fun uploadReviewVideo(
        uri: Uri,
        sizeBytes: Long,
        mimeType: String,
        onProgress: (Float) -> Unit,
    ): NetworkResult<String>

    /** Uploads a generated poster-frame JPEG (best-effort) and returns its Blob URL for `thumbnail`. */
    suspend fun uploadReviewThumbnail(jpegBytes: ByteArray): NetworkResult<String>

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
