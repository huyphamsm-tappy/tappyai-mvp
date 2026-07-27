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
)

data class ReviewProfile(
    val fullName: String?,
    val avatarUrl: String?,
    // Social fields — populated from GET /api/users/{id} (UserProfileDto). The embedded review
    // author (ProfileDto) only carries name+avatar, so these default to 0/false there.
    val userId: String? = null,
    val followerCount: Int = 0,
    val followingCount: Int = 0,
    val reviewCount: Int = 0,
    val isFollowing: Boolean = false,
    val isSelf: Boolean = false,
)

data class ReviewMusic(
    val version: Int,
    val trackId: String,
    val startSec: Int,
    val volume: Double,
    val origin: String?,
)
