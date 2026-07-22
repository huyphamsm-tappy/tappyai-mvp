package com.tappyai.app.myreviews

/**
 * One of the user's own reviews/posts — mirrors the web `/profile/posts` grid row
 * (`reviews` table). [photoUrl] null → the grid shows a text thumbnail (never a fake image).
 */
data class Review(
    val id: String,
    val placeName: String,
    val body: String,
    val photoUrl: String?,
    val rating: Int,
    val isHidden: Boolean,
    val likeCount: Int,
    val commentCount: Int,
)
