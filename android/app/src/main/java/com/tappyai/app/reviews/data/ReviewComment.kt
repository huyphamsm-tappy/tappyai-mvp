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

/**
 * What `POST /api/reviews/{id}/comments` gives back: the created [comment] and the review's
 * updated total [count]. The count is the server's number (it includes replies), the same one the
 * web's CommentDrawer hands to the feed via `onAdded(id, count)` — callers must NOT recount the
 * list they hold, which may be a partial page.
 */
data class PostedComment(
    val comment: ReviewComment,
    val count: Int,
)
