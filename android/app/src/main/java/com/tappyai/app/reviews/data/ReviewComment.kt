package com.tappyai.app.reviews.data

data class ReviewComment(
    val id: String,
    val body: String,
    val createdAt: String,
    val userId: String,
    val profiles: ReviewProfile?,
    /** Non-null when this comment is a reply to another (one-level threading, web parity). */
    val parentCommentId: String? = null,
    /** Reaction key → count, e.g. {"like": 2, "love": 1}. Keys match [COMMENT_REACTIONS]. */
    val reactions: Map<String, Int> = emptyMap(),
    /** The signed-in user's own reaction key on this comment (one per user), or null. */
    val myReaction: String? = null,
)
