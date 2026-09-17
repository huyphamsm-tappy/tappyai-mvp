package com.tappyai.app.reviews.ui

import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Explore → My Profile (V3 self profile, mockup 05_17_48), implemented 2026-09-12 over the
 * existing `SelfProfileViewModel` / `ReviewsRoute.SelfProfile` / `GET /api/reviews/mine`.
 *
 * The header numbers are pinned through the pure [selfProfileFacts]; the screen inventory, the
 * entry point and the nav wiring through a source read (the screen is Hilt + NavController +
 * Coil; a Robolectric pass would exercise the mocks — same reasoning as `ExploreV3Test`).
 */
class SelfProfileV3Test {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private fun review(id: String, likes: Int, views: Int? = null, hidden: Boolean = false, video: Boolean = true) = Review(
        id = id, userId = "me", placeName = "Chia sẻ", placeAddress = null, rating = 5, body = "b",
        photos = null, likeCount = likes, commentCount = 0, saveCount = null, createdAt = "", likedByMe = false,
        savedByMe = false, profiles = null, contentType = if (video) ReviewContentType.Video else ReviewContentType.Photo,
        mediaUrl = null, thumbnail = null, sourceType = null, sourceUrl = null, hashtags = null, watchTimeAvg = null,
        score = null, music = null, isHidden = hidden, viewCount = views,
    )

    // ── header facts: real numbers only ───────────────────────────────────

    @Test
    fun `facts come from the profile row, the loaded posts and the membership row - nothing else`() {
        val profile = ReviewProfile(fullName = "Huy Phạm", avatarUrl = "https://a/x.png", followerCount = 1248, followingCount = 56, reviewCount = 1)
        val posts = listOf(review("a", likes = 100, views = 12_400), review("b", likes = 28, hidden = true), review("c", likes = 0))
        val f = selfProfileFacts(profile, posts, isPro = true)
        assertEquals("Huy Phạm", f.displayName)
        assertEquals("@huyphạm", f.handle)
        assertEquals("https://a/x.png", f.avatarUrl)
        assertEquals(56, f.followingCount)
        assertEquals(1248, f.followerCount)
        // The function counts what it is given; the screen gives it the PUBLIC rows (SelfProfileCollectionsTest).
        assertEquals("the rows it was given", 3, f.postCount)
        assertEquals("sum of like_count over those rows", 128, f.totalLikes)
        assertEquals(true, f.isPro)
    }

    @Test
    fun `no profile row, no posts, unknown membership - zeros and no badge, never a placeholder number`() {
        val f = selfProfileFacts(null, emptyList(), isPro = null)
        assertNull(f.displayName)
        assertEquals("@user", f.handle)
        assertEquals(0, f.followingCount); assertEquals(0, f.followerCount)
        assertEquals(0, f.postCount); assertEquals(0, f.totalLikes)
        assertNull("null means unknown, and the badge is not drawn", f.isPro)
        assertEquals(false, selfProfileFacts(null, emptyList(), isPro = false).isPro)
    }

    @Test
    fun `a blank name is no name`() {
        assertNull(selfProfileFacts(ReviewProfile(fullName = "   ", avatarUrl = null), emptyList(), null).displayName)
    }

    // ── the wire carries view_count and the model keeps it ────────────────

    @Test
    fun `view_count reaches the model from the DTO, null when the row has none`() {
        val dtos = src("app/src/main/java/com/tappyai/app/reviews/data/ReviewNetworkDtos.kt")
        assertTrue(dtos.contains("@SerialName(\"view_count\") val viewCount: Int? = null"))
        assertTrue(dtos.contains("viewCount = viewCount,"))
        assertNull(review("x", 0).viewCount)
        assertEquals(7, review("x", 0, views = 7).viewCount)
    }

    // ── the screen ────────────────────────────────────────────────────────

    private val screen by lazy { src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileScreen.kt") }

    @Test
    fun `the screen draws the V3 inventory in mockup order - header, identity, stats, actions, segment, grid`() {
        // 2026-09-13: the body is the shared CreatorProfileContent (also drawn for other creators);
        // the self screen feeds it self facts and the Edit action.
        val body = screen.substring(screen.indexOf("internal fun SelfProfileScreen("), screen.indexOf("internal fun ReviewProfileScreen("))
        assertTrue(body.contains("CreatorProfileTopBar(onBack = onBack, onSearch = onSearch, onNotifications = onNotifications)"))
        assertTrue("facts, not raw state, feed the header — over the public rows the grid draws", body.contains("selfProfileFacts(uiState.profile, publicPosts, uiState.isPro, uiState.bio)"))
        assertTrue(body.contains("primaryAction = CreatorPrimaryAction.Edit(onEdit = onEditProfile),") && body.contains("showCompose = true,"))
        val content = screen.substring(screen.indexOf("private fun CreatorProfileContent("), screen.indexOf("private fun CreatorProfileTopBar("))
        assertTrue("three columns", content.contains("GridCells.Fixed(3)"))
        assertTrue("own clips hand their id up; the nav host decides the destination", content.contains("PostGridTile(review = review, onClick = { onReviewClick(review.id) })"))
        assertTrue("empty state with a real action", body.contains("R.string.reviews_self_empty_title") && body.contains("onAction = onCompose"))
        assertTrue("loading and error states kept", body.contains("TappyLoadingIndicator(") && body.contains("TappyErrorState("))
        assertTrue("reloads on return, as before", body.contains("ReloadOnResume { viewModel.load() }"))

        val header = screen.substring(screen.indexOf("private fun CreatorProfileHeader("), screen.indexOf("private fun Stat("))
        val identity = header.indexOf("TappyAvatar(")
        val stats = header.indexOf("R.string.reviews_self_stat_following")
        val actions = header.indexOf("R.string.reviews_self_edit_profile")
        val segment = header.indexOf("ProfileSegment(")
        assertTrue("identity → stats → actions → segment", identity in 1 until stats && stats < actions && actions < segment)
        assertTrue("Premium only for a real true", header.contains("if (facts.isPro == true)"))
        assertTrue("four stats: following, followers, posts, likes", header.contains("R.string.reviews_self_stat_followers") && header.contains("R.string.reviews_profile_stat_posts") && header.contains("R.string.reviews_profile_stat_likes"))
        assertTrue("link shares the web profile URL", header.contains("onClick = onShareLink") && screen.contains("BuildConfig.WEB_APP_URL.trimEnd('/') + \"/users/\" + userId"))
        assertTrue("compose opens the composer", header.contains("onClick = onCompose"))
        assertTrue("the primary action is the Edit branch for self", header.contains("is CreatorPrimaryAction.Edit -> PrimaryAction(") && header.contains("onClick = primaryAction.onEdit,"))
        assertTrue("the bio is drawn only when the server has one", header.contains("facts.bio?.let { bio ->"))
        assertFalse("no city invented", header.contains("facts.city") || header.contains("R.string.reviews_self_city"))
        // 2026-09-13: "Đã lưu" joined "Bài viết" — GET /api/reviews/saved exists (see ProfileSavedTest); Liked still has no API.
        // 2026-09-17: the personal segments (Đã thích / Đã lưu / Đã ẩn / Đã share) are self-only, behind showCollections.
        assertTrue("the personal segments, self-only (behind showCollections)", header.contains("val tabs = if (showCollections) CreatorProfileTab.entries else listOf(CreatorProfileTab.Posts)"))
        assertFalse("no Liked segment without an API", header.contains("reviews_self_tab_liked"))
    }

    @Test
    fun `a grid tile shows the thumbnail, a play badge for a clip and the view count only when carried`() {
        val tile = screen.substring(screen.indexOf("private fun PostGridTile("), screen.indexOf("private fun shareProfileLink("))
        assertTrue(tile.contains("review.thumbnail ?: review.photos?.firstOrNull()"))
        assertTrue(tile.contains("if (review.contentType == ReviewContentType.Video)") && tile.contains("Icons.Filled.PlayArrow"))
        assertTrue(tile.contains("review.viewCount?.let { views ->") && tile.contains("compactCount(views)"))
        assertTrue("hidden posts keep their veil", tile.contains("if (review.isHidden)"))
        assertTrue(tile.contains("aspectRatio(9f / 16f)"))
    }

    @Test
    fun `every label the screen speaks or shows is a resource`() {
        assertFalse(Regex("contentDescription = \"[A-Za-z]").containsMatchIn(screen))
        assertFalse(Regex("text = \"[A-Za-z]").containsMatchIn(screen))
        val vi = src("app/src/main/res/values-vi/strings_reviews.xml")
        val en = src("app/src/main/res/values/strings_reviews.xml")
        for (key in listOf("reviews_self_profile_open", "reviews_self_stat_following", "reviews_self_stat_followers", "reviews_self_premium", "reviews_self_edit_profile", "reviews_self_share_link", "reviews_self_new_post", "reviews_self_tab_posts", "reviews_self_empty_title", "reviews_self_empty_message", "reviews_self_share_text")) {
            assertTrue("$key in vi", vi.contains("name=\"$key\""))
            assertTrue("$key in en", en.contains("name=\"$key\""))
        }
        assertTrue(vi.contains(">Đang theo dõi<") && vi.contains(">Người theo dõi<") && vi.contains(">Sửa hồ sơ<"))
    }

    // ── navigation ────────────────────────────────────────────────────────

    @Test
    fun `Explore reaches SelfProfile from the feed header, and SelfProfile reaches its clip pager, search, notifications and the composer`() {
        val nav = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")
        assertTrue("the entry point", nav.contains("onProfile = { navController.navigate(ReviewsRoute.SelfProfile) }"))
        val self = nav.substring(nav.indexOf("composable<ReviewsRoute.SelfProfile>"), nav.indexOf("composable<ReviewsRoute.Detail>"))
        assertTrue("a tile opens the own-posts clip pager on that clip (2026-09-13), not a single Detail", self.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))"))
        assertTrue(self.contains("onBack = { navController.popBackStack() }"))
        assertTrue(self.contains("onSearch = { navController.navigate(ReviewsRoute.Search) }"))
        assertTrue(self.contains("onNotifications = { navController.navigate(ReviewsRoute.Notifications) }"))
        assertTrue(self.contains("onCompose = { navController.navigate(ReviewsRoute.Composer) }"))
        assertTrue("edit opens Explore's own Edit Profile (owner revision 2026-09-12), not the Tôi tab", self.contains("onEditProfile = { navController.navigate(ReviewsRoute.EditProfile) }"))
        val routes = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt")
        assertTrue(routes.contains("data object SelfProfile : ReviewsRoute"))

        val feed = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        val bar = feed.substring(feed.indexOf("private fun FeedTopBar("), feed.indexOf("private fun ExploreHeaderAction("))
        assertTrue("the person button in the feed header", bar.contains("onClick = onProfile") && bar.contains("Icons.Filled.PersonOutline"))
        assertTrue(bar.contains("stringResource(R.string.reviews_self_profile_open)"))
        assertTrue("a post's author link still opens the AUTHOR", Regex("""onAuthorClick = \{ userId ->\s+navController\.navigate\(ReviewsRoute\.AuthorProfile\(userId = userId\)\)""").containsMatchIn(nav))
    }

    @Test
    fun `the ViewModel asks the membership row beside the profile and never lets it fail the load`() {
        val vm = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileViewModel.kt")
        assertTrue(vm.contains("private val membershipRepository: MembershipRepository"))
        assertTrue(vm.contains("val membership = async { membershipRepository.getStatus() }"))
        assertTrue(vm.contains("val isPro = (membership.await() as? NetworkResult.Success)?.data?.isPro"))
        assertTrue("the load still fails only when BOTH profile and posts fail", vm.contains("if (profile == null && posts == null)"))
        assertTrue("own posts from the existing endpoint", vm.contains("repository.getMine()"))
    }
}
