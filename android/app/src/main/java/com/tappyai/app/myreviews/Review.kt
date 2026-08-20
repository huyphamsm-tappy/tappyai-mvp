package com.tappyai.app.myreviews

import com.tappyai.app.reviews.data.ReviewModeration

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
    /**
     * The safety gate's outcome for this post, when it did not publish it. Null means either the
     * gate is inactive or the post is live — both of which look identical to the author, and
     * correctly so.
     *
     * 🚨 NOT the same thing as [isHidden]. Hidden is the author's OWN choice and they can undo it;
     * this is the platform's, and they cannot. Showing one as the other would tell someone their
     * post is hidden by their own hand when it is not.
     */
    val moderation: ReviewModeration? = null,
)
