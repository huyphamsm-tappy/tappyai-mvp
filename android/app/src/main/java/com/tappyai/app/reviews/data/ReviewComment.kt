package com.tappyai.app.reviews.data

data class ReviewComment(
    val id: String,
    val body: String,
    val createdAt: String,
    val userId: String,
    val profiles: ReviewProfile?,
)
