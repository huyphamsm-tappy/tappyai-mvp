package com.tappyai.app.reviews.ui

import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.isShareOnlyName

/**
 * What ✦ Hỏi Tappy asks about for one clip — the subject the web's bridge carries
 * (`AskTappyButton.tsx` / reviews `feedShared.tsx`: `/chat?q=` + `bridge.promptEntity`, subject =
 * the review's `place_name`). The prompt names the entity and asks about it; it never decides
 * what the user wants.
 *
 * The web hides its button when the post has no real place (`isShareOnlyName`). The reference
 * design keeps the action on every clip, so a post without a place asks about its caption
 * instead (cut to [MAX_SUBJECT] characters — a subject, not an essay); a post with neither
 * yields null and the caller hides the action.
 */
internal fun askTappySubject(review: Review): String? {
    if (!isShareOnlyName(review.placeName)) return review.placeName.trim()
    val caption = review.body.trim()
    if (caption.isEmpty()) return null
    return if (caption.length <= MAX_SUBJECT) caption else caption.take(MAX_SUBJECT).trimEnd() + "…"
}

private const val MAX_SUBJECT = 80
