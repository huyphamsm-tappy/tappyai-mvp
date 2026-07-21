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
