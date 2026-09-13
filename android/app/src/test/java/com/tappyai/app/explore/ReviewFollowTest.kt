package com.tappyai.app.explore

import com.tappyai.app.reviews.data.ReviewDto
import com.tappyai.app.reviews.data.SEED_REVIEWS
import com.tappyai.app.reviews.data.toDomain
import com.tappyai.app.reviews.ui.withFollowState
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The rail avatar's "+" is the DIRECT follow (owner ruling 2026-09-13): tap the avatar → the
 * creator's profile; tap the badge → follow/unfollow the author while staying on the clip; the
 * header's own "+" → Create Post. Three actions, kept apart.
 *
 * Nothing new on the wire: the feed route already stamps `is_following` on every row for a
 * signed-in viewer (`followedAuthorIds.includes(r.user_id)`), and the toggle is the existing
 * `POST /api/users/{id}/follow` the profile screen calls through `ReviewsRepository.toggleFollow`.
 */
class ReviewFollowTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private val card get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewCard.kt")
    private val vm get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt")

    @Test
    fun `the feed row's is_following reaches the model, false when absent`() {
        val json = Json { ignoreUnknownKeys = true }
        val followed = json.decodeFromString<ReviewDto>("""{"id":"r1","user_id":"u1","place_name":"Chia sẻ","is_following":true}""").toDomain()
        val notFollowed = json.decodeFromString<ReviewDto>("""{"id":"r2","user_id":"u2","place_name":"Chia sẻ"}""").toDomain()
        assertTrue(followed.isFollowingAuthor)
        assertFalse(notFollowed.isFollowingAuthor)
    }

    @Test
    fun `withFollowState flips every row by that author and hands the others back unchanged`() {
        val rows = SEED_REVIEWS.take(4)
        val author = rows[0].userId
        val byAuthor = rows.count { it.userId == author }
        val out = rows.withFollowState(author, true)
        assertEquals(byAuthor, out.count { it.isFollowingAuthor })
        rows.indices.filter { rows[it].userId != author }.forEach { assertSame(rows[it], out[it]) }
        assertSame("an equal state is a no-op for that row", rows[0], rows.withFollowState(author, false)[0])
        assertEquals(rows, rows.withFollowState("nobody", true))
    }

    @Test
    fun `the ViewModel follows through the existing toggle, optimistically, with rollback and a self guard`() {
        val fn = vm.substring(vm.indexOf("fun toggleFollow(review: Review) {"), vm.indexOf("private val followInFlight"))
        assertTrue("the existing repository toggle (POST /api/users/{id}/follow)", fn.contains("repository.toggleFollow(authorId)"))
        assertTrue("optimistic flip of every row by the author", fn.contains("s.reviews.withFollowState(authorId, target)"))
        assertTrue("the server's answer is written back", fn.contains("s.reviews.withFollowState(authorId, result.data)"))
        assertTrue("a failure reverts", fn.contains("s.reviews.withFollowState(authorId, !target)"))
        assertTrue("never follow oneself, never double-fire", fn.contains("if (authorId == _uiState.value.currentUserId || authorId in followInFlight) return"))
        assertFalse("no new endpoint or client of its own", vm.contains("@POST") || vm.contains("followUser(") || vm.contains("HttpClient"))
    }

    @Test
    fun `the avatar opens the profile, the badge follows, and the badge is absent on the viewer's own post`() {
        val avatar = card.substring(card.indexOf("private fun RailAvatar("), card.indexOf("private fun RailAction("))
        val avatarTap = avatar.indexOf("onClick = onClick,")
        val badge = avatar.indexOf("if (!isMe && onFollow != null) {")
        val badgeTap = avatar.indexOf("onClick = onFollow,")
        assertTrue("avatar tap → profile callback; badge tap → follow callback, in that order", avatarTap in 1 until badge && badge < badgeTap)
        assertTrue("+ before following, a check once followed", avatar.contains("if (following) Icons.Filled.Check else Icons.Filled.Add"))
        assertTrue("the badge stays attached to the avatar's lower edge, small, accent", avatar.contains(".align(Alignment.BottomCenter)") && avatar.contains(".size(22.dp)") && avatar.contains("ExploreV3.Purple"))
        assertTrue("spoken as Follow / Following", avatar.contains("R.string.reviews_profile_following") && avatar.contains("R.string.reviews_profile_follow"))
        val pager = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewClipPager.kt")
        assertTrue(pager.contains("onFollow = { viewModel.toggleFollow(review) },") && pager.contains("onAvatarClick = { onAuthorClick(review.userId) },"))
    }

    @Test
    fun `the header keeps its own Create Post plus, separate from the follow badge`() {
        val screens = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        val bar = screens.substring(screens.indexOf("private fun FeedTopBar("), screens.indexOf("private fun BrandWordmark3D("))
        assertTrue(bar.contains("onClick = onCompose") && bar.contains("Icons.Filled.Add") && bar.contains("stringResource(R.string.reviews_tab_compose)"))
        val plus = bar.indexOf("onClick = onCompose"); val search = bar.indexOf("onClick = onSearch")
        assertTrue("+ sits before search, bell, profile", plus in 1 until search)
        val nav = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")
        assertTrue("the existing composer flow", nav.contains("onCompose = { navController.navigate(ReviewsRoute.Composer) },"))
    }
}
