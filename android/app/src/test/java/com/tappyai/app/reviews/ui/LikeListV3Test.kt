package com.tappyai.app.reviews.ui

import com.tappyai.app.reviews.data.LikersResponseDto
import com.tappyai.app.reviews.data.toDomain
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The like list — web `LikeListSheet.tsx` over `GET /api/reviews/[id]/likes` (2026-09-17). The
 * COUNT's control, never the heart's.
 */
class LikeListV3Test {

    @Test
    fun `the likes page decodes the route's shape - likers with the three public fields, next_cursor for paging`() {
        val page = Json { ignoreUnknownKeys = true }.decodeFromString<LikersResponseDto>(
            """{"likers":[{"id":"u2","full_name":"Lan Nguyễn","avatar_url":"https://cdn/a.png","created_at":"2026-09-17T09:00:00+07:00"},{"id":"anon","full_name":null,"avatar_url":null,"created_at":"2026-09-17T08:00:00+07:00"}],"next_cursor":"2026-09-17T08:00:00+07:00"}""",
        )
        assertEquals(2, page.likers.size)
        assertEquals("Lan Nguyễn", page.likers[0].toDomain().fullName)
        assertNull("an anonymous liker still counts", page.likers[1].toDomain().fullName)
        assertEquals("2026-09-17T08:00:00+07:00", page.nextCursor)
        assertNull(Json.decodeFromString<LikersResponseDto>("""{"likers":[],"next_cursor":null}""").nextCursor)
    }

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    @Test
    fun `the count opens the sheet and the heart stays the toggle, on the pager and the detail`() {
        val card = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewCard.kt")
        assertTrue(card.contains("onClick = onLike,\n            onLabelClick = onOpenLikes,"))
        assertTrue("the label alone is the second control", card.contains("if (onLabelClick != null) Modifier"))
        val pager = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewClipPager.kt")
        assertTrue(pager.contains("onOpenLikes = { likesFor = review.id }") && pager.contains("ReviewLikeListSheet(reviewId = reviewId, onDismiss = { likesFor = null })"))
        val detail = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        assertTrue(detail.contains("onOpenLikes = { likesFor = review.id }") && detail.contains("ReviewLikeListSheet(reviewId = id, onDismiss = { likesFor = null })"))
        val sheet = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewLikeListSheet.kt")
        assertTrue("the anonymous fallback name the feed and the inbox use", sheet.contains("R.string.reviews_anonymous_name"))
        assertTrue("paging appends, `before` is the cursor", sheet.contains("repository.getLikers(reviewId, before = cursor)") && sheet.contains("likers = likers + result.data.likers"))
        assertFalse("no follow button in the list - the web's sheet has none", sheet.contains("toggleFollow"))
        val api = src("app/src/main/java/com/tappyai/app/reviews/data/ReviewsApi.kt")
        assertTrue(api.contains("@GET(\"api/reviews/{id}/likes\")"))
    }
}
