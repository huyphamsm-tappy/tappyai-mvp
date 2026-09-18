package com.tappyai.app.reviews.data

/**
 * One user row in the Explore search "Users" mode — mirrors the web's user-search result
 * (`/api/users/search`): identity + follower/following counts + whether the signed-in caller
 * already follows them (drives the Follow / Following button state).
 */
data class UserSearchResult(
    val id: String,
    val fullName: String?,
    val avatarUrl: String?,
    val followerCount: Int,
    val followingCount: Int,
    val isFollowing: Boolean,
)

/** One person who currently likes a post (`GET /api/reviews/{id}/likes`). Only the three public profile fields. */
data class Liker(
    val id: String,
    val fullName: String?,
    val avatarUrl: String?,
    val createdAt: String,
)

/** One page of likers; [nextCursor] is the `before` for the next page, null at the end. */
data class LikersPage(val likers: List<Liker>, val nextCursor: String?)
