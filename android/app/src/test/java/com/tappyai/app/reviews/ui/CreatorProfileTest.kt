package com.tappyai.app.reviews.ui

import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewProfile
import com.tappyai.app.reviews.data.SEED_REVIEWS
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * One creator-profile UI for three entry points (2026-09-13): Explore → My Profile
 * (`SelfProfile`), a feed avatar/handle and a Search result (both `AuthorProfile`). The other
 * creator's profile used to be a separate, older layout (`ReviewProfileSection.kt`); now both
 * screens draw [CreatorProfileContent] and differ only in data and in the primary action —
 * "Sửa hồ sơ" for self, Theo dõi / Đang theo dõi for others — with the server's `is_self`
 * deciding which. The facts mapping runs for real; the composition/nav inventory is pinned by a
 * source read like the neighbouring tests (the ViewModels take the concrete AuthRepository).
 */
class CreatorProfileTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private fun exists(rel: String): Boolean {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            if (File(dir, rel).isFile) return true
            dir = dir.parentFile
        }
        return false
    }

    private val screen get() = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileScreen.kt")
    private val nav get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")
    private val selfBody get() = screen.substring(screen.indexOf("internal fun SelfProfileScreen("), screen.indexOf("internal fun ReviewProfileScreen("))
    private val otherBody get() = screen.substring(screen.indexOf("internal fun ReviewProfileScreen("), screen.indexOf("internal sealed interface CreatorPrimaryAction"))
    private val header get() = screen.substring(screen.indexOf("private fun CreatorProfileHeader("), screen.indexOf("private fun Stat("))

    private fun profile(isSelf: Boolean = false, isFollowing: Boolean = false, reviewCount: Int = 7) = ReviewProfile(
        fullName = "Huy Phạm", avatarUrl = "https://a/p.png", isFollowing = isFollowing, isSelf = isSelf,
        followerCount = 2, followingCount = 3, reviewCount = reviewCount,
    )

    // ── 1 + 3: the routes did not move ──

    @Test
    fun `Search results and feed avatars still open AuthorProfile - and Notifications too`() {
        val search = nav.substring(nav.indexOf("composable<ReviewsRoute.Search>"))
        assertTrue(search.contains("onUserClick = { userId ->\n                    navController.navigate(ReviewsRoute.AuthorProfile(userId = userId))"))
        assertTrue(Regex("""onAuthorClick = \{ userId ->\s+navController\.navigate\(ReviewsRoute\.AuthorProfile\(userId = userId\)\)""").containsMatchIn(nav))
        assertTrue(nav.contains("""notification.url.startsWith("/users/") -> {"""))
        assertFalse("no new profile route", src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt").contains("CreatorProfile"))
    }

    // ── 2 + 4 + 12: one body for both screens ──

    @Test
    fun `AuthorProfile renders the canonical V3 body - the same content, top bar and tile as Self Profile`() {
        assertTrue(nav.contains("composable<ReviewsRoute.AuthorProfile> { entry ->") && nav.contains("ReviewProfileScreen(\n                userId = route.userId,"))
        for (piece in listOf("CreatorProfileTopBar(onBack = onBack, onSearch = onSearch, onNotifications = onNotifications)", "CreatorProfileContent(", "ExploreV3.Background")) {
            assertTrue("self: $piece", selfBody.contains(piece))
            assertTrue("other: $piece", otherBody.contains(piece))
        }
        val content = screen.substring(screen.indexOf("private fun CreatorProfileContent("), screen.indexOf("private fun CreatorProfileTopBar("))
        assertTrue(content.contains("CreatorProfileHeader(") && content.contains("PostGridTile(review = review, onClick = { onReviewClick(review.id) })") && content.contains("GridCells.Fixed(3)"))
        assertFalse("no second grid/tile implementation anywhere in the file", screen.contains("ReviewClipTile") || screen.contains("ReviewProfileHeader"))
        assertFalse("the legacy screen body is gone from ReviewsScreens.kt", src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt").contains("fun ReviewProfileScreen("))
    }

    // ── 5 + 6 + 7 + 8 + 9: the primary action ──

    @Test
    fun `other creators get Follow, the owner gets Edit, and is_self from the server decides`() {
        assertTrue(otherBody.contains("primaryAction = CreatorPrimaryAction.Follow(") && otherBody.contains("isFollowing = profile.isFollowing,") && otherBody.contains("onToggle = viewModel::toggleFollow,"))
        assertTrue(selfBody.contains("primaryAction = CreatorPrimaryAction.Edit(onEdit = onEditProfile),"))
        assertTrue("is_self → the self screen, never a Follow button for oneself", otherBody.contains("if (profile?.isSelf == true) {") && otherBody.contains("SelfProfileScreen(") && otherBody.contains("onEditProfile = onEditProfile,"))
        assertFalse("no client-side id comparison decides self", otherBody.contains("currentUserId"))
        assertFalse("the self body never builds a Follow action", selfBody.contains("CreatorPrimaryAction.Follow"))
        // The header renders exactly one branch per action.
        assertTrue(header.contains("is CreatorPrimaryAction.Edit -> PrimaryAction(") && header.contains("is CreatorPrimaryAction.Follow -> PrimaryAction("))
        assertTrue(header.contains("R.string.reviews_self_edit_profile") && header.contains("R.string.reviews_profile_following") && header.contains("R.string.reviews_profile_follow"))
        assertTrue("Theo dõi is the filled call to action; Đang theo dõi the outline", header.contains("filled = !primaryAction.isFollowing,"))
        assertTrue("disabled while the toggle is in flight", header.contains("enabled = !primaryAction.isToggling,"))
        assertTrue("the follow model keeps its optimistic flip + rollback", src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewProfileViewModel.kt").contains("fun toggleFollow()"))
    }

    @Test
    fun `compose and EditNote are self-only`() {
        assertTrue(selfBody.contains("showCompose = true,"))
        assertTrue(otherBody.contains("showCompose = false,"))
        assertTrue(header.contains("if (showCompose) {") && header.contains("Icons.Filled.EditNote"))
        assertTrue("the edit route stays the existing one, wired from the nav host", nav.contains("onEditProfile = { navController.navigate(ReviewsRoute.EditProfile) },"))
    }

    // ── 10 + 11: facts for another creator ──

    @Test
    fun `another creator's facts carry no bio and no Premium, the server's post count and the summed likes`() {
        val rows: List<Review> = SEED_REVIEWS.take(3)
        val facts = creatorProfileFacts(profile(reviewCount = 42), rows)
        assertEquals("Huy Phạm", facts.displayName)
        assertEquals("@huyphạm", facts.handle)
        assertEquals("https://a/p.png", facts.avatarUrl)
        assertEquals(3, facts.followingCount)
        assertEquals(2, facts.followerCount)
        assertEquals("post count is the server's review_count, not the loaded page", 42, facts.postCount)
        assertEquals(rows.sumOf { it.likeCount }, facts.totalLikes)
        assertNull("no membership API for others", facts.isPro)
        assertNull("no bio on /api/users/{id}", facts.bio)
        assertTrue(otherBody.contains("facts = creatorProfileFacts(profile, uiState.reviews),"))
        assertTrue("Premium and bio are drawn only when carried", header.contains("if (facts.isPro == true)") && header.contains("facts.bio?.let { bio ->"))
        // Self facts are untouched (their own tests pin them); the mapping is a copy of them.
        assertEquals(selfProfileFacts(profile(), rows, null, null).copy(postCount = 7), creatorProfileFacts(profile(), rows))
    }

    // ── 13 + 14 + 15: tiles → ProfileClips; the pager and the sheet are as they were ──

    @Test
    fun `a tile on either profile opens ProfileClips, scoped to that profile`() {
        val self = nav.substring(nav.indexOf("composable<ReviewsRoute.SelfProfile>"), nav.indexOf("composable<ReviewsRoute.EditProfile>"))
        val author = nav.substring(nav.indexOf("composable<ReviewsRoute.AuthorProfile>"), nav.indexOf("composable<ReviewsRoute.ProfileClips>"))
        assertTrue(self.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))"))
        assertTrue(author.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = route.userId, startReviewId = reviewId))"))
        assertFalse(author.contains("ReviewsRoute.Detail"))
        val vm = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt")
        assertTrue("the pager's profile source is unchanged", vm.contains("""else -> repository.getFeed(page = pageIndex, limit = PAGE_SIZE, sort = "latest", userId = userId)"""))
        val pager = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewClipPager.kt")
        assertTrue("the comment sheet is still the pager's", pager.contains("onComment = { commentsFor = review.id },") && pager.contains("ReviewCommentSheet("))
    }

    // ── every SELF entry point pages /api/reviews/mine; every other creator pages ?userId= ──

    @Test
    fun `is_self tiles open ProfileClips(userId = null) - the own-posts source - while other creators keep their userId`() {
        val author = nav.substring(nav.indexOf("composable<ReviewsRoute.AuthorProfile>"), nav.indexOf("composable<ReviewsRoute.ProfileClips>"))
        assertTrue("other creator → that author's clips", author.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = route.userId, startReviewId = reviewId))"))
        assertTrue("self (server is_self) → own clips, same as Explore → My Profile", Regex("""onSelfReviewClick = \{ reviewId ->\s+navController\.navigate\(ReviewsRoute\.ProfileClips\(userId = null, startReviewId = reviewId\)\)""").containsMatchIn(author))
        assertTrue("the self branch of the screen uses the self callback", otherBody.contains("onReviewClick = onSelfReviewClick ?: onReviewClick,"))
        assertTrue("the self branch is gated on the server flag", otherBody.contains("if (profile?.isSelf == true) {"))
        val self = nav.substring(nav.indexOf("composable<ReviewsRoute.SelfProfile>"), nav.indexOf("composable<ReviewsRoute.EditProfile>"))
        assertTrue(self.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))"))
        // The two sources, and no discovery feed in between.
        val vm = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt")
        val load = vm.substring(vm.indexOf("private suspend fun loadPage("), vm.indexOf("private val ReviewsFeedSource.isMine"))
        val profile = load.substring(load.indexOf("is ReviewsFeedSource.Profile ->"))
        assertTrue(profile.contains("null -> if (pageIndex == 0) repository.getMine() else NetworkResult.Success(emptyList())"))
        assertTrue(profile.contains("""else -> repository.getFeed(page = pageIndex, limit = PAGE_SIZE, sort = "latest", userId = userId)"""))
        assertFalse(profile.contains("sortFor(") || profile.contains("following") || profile.contains("trending"))
        // startReviewId still picks the page.
        val rows = SEED_REVIEWS.take(3)
        assertEquals(1, initialPageFor(rows, rows[1].id))
        assertEquals(0, initialPageFor(rows, "gone"))
        // The Me tab's nested profile passes no self callback: its behaviour is untouched.
        assertFalse(src("app/src/main/java/com/tappyai/app/profile/ProfileTab.kt").contains("onSelfReviewClick"))
    }

    // ── the legacy layout is gone, with nothing left pointing at it ──

    @Test
    fun `the legacy ReviewProfileSection is deleted and unreferenced`() {
        assertFalse(exists("app/src/main/java/com/tappyai/app/reviews/ui/ReviewProfileSection.kt"))
        val root = run {
            var dir: File? = File(".").absoluteFile
            while (dir != null && !File(dir, "app/src/main/java").isDirectory) dir = dir.parentFile
            dir ?: error("android root not found")
        }
        val hits = File(root, "app/src").walkTopDown()
            .filter { it.isFile && (it.extension == "kt" || it.extension == "xml") }
            .filter { f -> f.readText().let { t -> t.contains("ReviewProfileHeader") || t.contains("ReviewClipTile") || t.contains("reviewProfileItems") || t.contains("ReviewProfileReviewItem") } }
            .map { it.relativeTo(root).path }
            .toList()
        assertTrue("no production or test source references the legacy section, found: $hits", hits.all { it.replace('\\', '/').endsWith("reviews/ui/CreatorProfileTest.kt") })
    }

    @Test
    fun `the Me tab's nested author profile shares the same screen and only adapted its callback`() {
        val me = src("app/src/main/java/com/tappyai/app/profile/ProfileTab.kt")
        assertTrue(me.contains("ReviewProfileScreen(") && me.contains("onReviewClick = { reviewId -> navController.navigate(ProfileRoute.ReviewDetail(reviewId)) },"))
    }
}
