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
    // Follow state — populated only by the user-profile endpoint (GET /api/users/{id}). The
    // feed-embedded ProfileDto carries none, so these default to false/0 there (and for seed data).
    val isFollowing: Boolean = false,
    val isSelf: Boolean = false,
    val followerCount: Int = 0,
)

data class ReviewMusic(
    val version: Int,
    val trackId: String,
    val startSec: Int,
    val volume: Double,
    val origin: String?,
)
