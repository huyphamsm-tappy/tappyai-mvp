package com.tappyai.app.reviews.ui

import com.tappyai.app.reviews.data.Review
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Parity 2026-09-28 (L10): another user's profile on the web shows two tabs, "Bài đăng" and
 * "Chia sẻ" (`PublicProfileView` VISITOR_TAB_ORDER). "Chia sẻ" holds the posts that carry no real
 * place — the share-only rows (`isShareOnlyName`: clips/links posted as "Chia sẻ") — and
 * "Bài đăng" the rest. Android showed a single "Bài viết" grid with both mixed.
 */
class VisitorSharesTabTest {

    private fun review(id: String, place: String) = Review(
        id = id, userId = "u", placeName = place, placeAddress = null, rating = 5, body = "", photos = null,
        likeCount = 0, commentCount = 0, saveCount = null, createdAt = "2026-09-28T00:00:00Z", likedByMe = false,
        savedByMe = false, profiles = null, contentType = null, mediaUrl = null, thumbnail = null, sourceType = null,
        sourceUrl = null, hashtags = null, watchTimeAvg = null, score = null, isHidden = false,
    )

    @Test
    fun `posts and shares are split the way the web splits them`() {
        val rows = listOf(review("a", "Phở Hòa"), review("b", "Chia sẻ"), review("c", "  "), review("d", "Bánh mì"))
        val split = splitVisitorPosts(rows)
        assertEquals(listOf("a", "d"), split.posts.map { it.id })
        assertEquals(listOf("b", "c"), split.shares.map { it.id })
    }

    @Test
    fun `a profile with only shares opens on the shares tab`() {
        assertEquals(CreatorProfileTab.Shared, splitVisitorPosts(listOf(review("b", "Chia sẻ"))).initialTab)
        assertEquals(CreatorProfileTab.Posts, splitVisitorPosts(listOf(review("a", "Phở"), review("b", "Chia sẻ"))).initialTab)
    }
}
