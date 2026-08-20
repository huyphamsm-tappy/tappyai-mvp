package com.tappyai.app.reviews.data

data class Review(
    val id: String,
    val userId: String,
    /** The reviewed place's stable id (Google place id / slug). Null on legacy rows that predate
     *  it, and on seed/preview rows that have no real backend place. */
    val placeId: String? = null,
    val placeName: String,
    val placeAddress: String?,
    val rating: Int,
    val body: String,
    val photos: List<String>?,
    val likeCount: Int,
    val commentCount: Int,
    val saveCount: Int?,
    val createdAt: String,
    val likedByMe: Boolean,
    val savedByMe: Boolean,
    val profiles: ReviewProfile?,
    val contentType: ReviewContentType?,
    val mediaUrl: String?,
    val thumbnail: String?,
    val sourceType: ReviewSourceType?,
    val sourceUrl: String?,
    val hashtags: List<String>?,
    val watchTimeAvg: Double?,
    val score: Double?,
    val music: ReviewMusic?,
    val isHidden: Boolean,
    /**
     * The safety gate's outcome for this post, or null.
     *
     * Non-null only on the author's own profile feed — the backend attaches it by IDENTITY, not
     * by request shape, so this is never populated for someone else's post and can be rendered
     * unconditionally wherever it appears.
     */
    val moderation: ReviewModeration? = null,
)

/**
 * What the author is told about their own post's visibility.
 *
 * 🚨 [title] and [detail] are SERVER TEXT, already in the request language, and must be rendered
 * as-is. There is deliberately no code-to-string map on this side: the notice has to describe the
 * row that was stored, and a second wording maintained here is a second opinion that will
 * eventually disagree with it. The web makes the same choice for the same reason.
 */
data class ReviewModeration(
    val state: ReviewPublicationState,
    val title: String,
    val detail: String,
    /** True only for an actual finding — a hold for "could not check" must not look like one. */
    val assertsViolation: Boolean,
)

/**
 * 🔑 [Unknown] is a real member, not a defensive nicety. The backend may add a lifecycle state
 * (an asynchronous review path is explicitly a future capability), and an old client meeting a
 * new value must treat it as "not published" rather than crashing or, far worse, defaulting to
 * published. [isPublished] is the only place that question is answered.
 */
enum class ReviewPublicationState {
    Published,
    UnderReview,
    Restricted,
    Unknown,
    ;

    /** Fail-closed: only an explicit PUBLISHED counts as public. */
    val isPublished: Boolean get() = this == Published

    companion object {
        fun fromWire(value: String?): ReviewPublicationState = when (value) {
            "PUBLISHED" -> Published
            "UNDER_REVIEW" -> UnderReview
            "RESTRICTED" -> Restricted
            else -> Unknown
        }
    }
}

data class ReviewProfile(
    val fullName: String?,
    val avatarUrl: String?,
    // Follow state — populated only by the user-profile endpoint (GET /api/users/{id}). The
    // feed-embedded ProfileDto carries none, so these default to false/0 there (and for seed data).
    val isFollowing: Boolean = false,
    val isSelf: Boolean = false,
    val followerCount: Int = 0,
    val followingCount: Int = 0,
    val reviewCount: Int = 0,
)

data class ReviewMusic(
    val version: Int,
    val trackId: String,
    val startSec: Int,
    val volume: Double,
    val origin: String?,
)
