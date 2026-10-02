package com.tappyai.app.reviews.ui

import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewProfile

/**
 * What the V3 self-profile header states, derived once from the three real sources the screen
 * has: the profile row (`GET /api/users/{me}`), the user's own posts (`GET /api/reviews/mine`) and
 * the membership status (`GET /api/subscription`). Pure, so the derivations are unit-tested
 * without Hilt or a NavController.
 *
 * Every number is something the wire carries or a sum over rows the wire carried:
 *  - [followingCount] / [followerCount] are the profile row's own counters;
 *  - [postCount] is the number of own posts LOADED, hidden ones included — the same rows the grid
 *    draws, so the number and the grid can never disagree (the server's `review_count` excludes
 *    hidden posts and would);
 *  - [totalLikes] is the sum of those posts' `like_count`, exactly how the author profile already
 *    derives its "Lượt thích" (see [creatorProfileFacts]). `/api/reviews/mine` returns at most 100
 *    rows, so past that the sum covers the newest hundred — a limit, not an invention;
 *  - [isPro] is the membership row's `is_pro`; null while unknown (signed out / request failed),
 *    and the badge is simply not drawn then;
 *  - [bio] is `GET /api/profile`'s `bio` (auth metadata), blank or null when the user wrote none.
 *
 * What the mockup shows and the wire does not have — a city, a website, a username of the user's
 * own — is NOT here: the handle is derived from the display name the way the feed already does.
 */
data class SelfProfileFacts(
    val displayName: String?,
    val handle: String,
    val avatarUrl: String?,
    val followingCount: Int,
    val followerCount: Int,
    val postCount: Int,
    val totalLikes: Int,
    val isPro: Boolean?,
    val bio: String?,
)

internal fun selfProfileFacts(profile: ReviewProfile?, posts: List<Review>, isPro: Boolean?, bio: String? = null): SelfProfileFacts {
    val name = profile?.fullName?.trim()?.takeIf { it.isNotEmpty() }
    return SelfProfileFacts(
        displayName = name,
        handle = "@" + (name?.filterNot { it.isWhitespace() }?.lowercase() ?: "user"),
        avatarUrl = profile?.avatarUrl,
        followingCount = profile?.followingCount ?: 0,
        followerCount = profile?.followerCount ?: 0,
        postCount = posts.size,
        totalLikes = posts.sumOf { it.likeCount },
        isPro = isPro,
        bio = bio?.trim()?.takeIf { it.isNotEmpty() },
    )
}

/**
 * The same facts for ANOTHER creator, from what `GET /api/users/{id}` and the profile feed
 * carry: the identity and follow counters from the profile row; [SelfProfileFacts.postCount] is
 * the server's `review_count` (the public, publishable count — the loaded page holds at most 20
 * rows); likes are summed over the loaded rows, as the previous layout did. No bio and no
 * membership: `/api/users/{id}` returns neither, so neither is drawn.
 */
internal fun creatorProfileFacts(profile: ReviewProfile, posts: List<Review>): SelfProfileFacts =
    selfProfileFacts(profile, posts, isPro = null, bio = null).copy(postCount = profile.reviewCount)
