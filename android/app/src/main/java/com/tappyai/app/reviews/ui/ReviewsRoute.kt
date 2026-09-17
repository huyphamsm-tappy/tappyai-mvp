package com.tappyai.app.reviews.ui

import kotlinx.serialization.Serializable

sealed interface ReviewsRoute {
    @Serializable data object Feed : ReviewsRoute
    @Serializable data class Detail(val reviewId: String) : ReviewsRoute
    @Serializable data class AuthorProfile(val userId: String) : ReviewsRoute
    @Serializable data object Composer : ReviewsRoute
    @Serializable data object Notifications : ReviewsRoute
    @Serializable data object Search : ReviewsRoute

    /** The feed's music-disc bottom sheet — web parity `SoundSheet` (a compact `/sound/{id}`). */
    @Serializable data class SoundSheet(val trackId: String) : ReviewsRoute

    /** The signed-in user's own profile inside Explore (mirrors the web reviews ProfileTab). */
    @Serializable data object SelfProfile : ReviewsRoute

    /** Editing THAT profile — name, bio, avatar — inside Explore (V3, mockup 05_17_48). */
    @Serializable data object EditProfile : ReviewsRoute

    /**
     * A profile's clips as a vertical pager, opened from its grid at [startReviewId] — web parity
     * `ClipViewer({ posts, startIndex })` (reviews/ProfileTab.tsx). [userId] null = the signed-in
     * user's own posts (`/api/reviews/mine`), otherwise that author's posts (`?userId=`). The list
     * is fetched by the destination, never carried in the route. Only the profile's own clips are
     * paged — never the discovery feed.
     */
    @Serializable data class ProfileClips(
        val userId: String?,
        val startReviewId: String,
        /** True for the self profile's "Đã lưu" grid: the pager pages the caller's saved reviews
         *  (`/api/reviews/saved`) instead of a profile's posts. [userId] is ignored then. */
        val saved: Boolean = false,
    ) : ReviewsRoute
}
