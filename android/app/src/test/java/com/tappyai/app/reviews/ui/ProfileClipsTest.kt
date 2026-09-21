package com.tappyai.app.reviews.ui

import androidx.lifecycle.SavedStateHandle
import com.tappyai.app.reviews.data.SEED_REVIEWS
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Profile → clip pager (UAT 2026-09-13): a grid tile used to open `ReviewsRoute.Detail`, one clip
 * with no way to the next but Back. Now it opens `ReviewsRoute.ProfileClips(userId, startReviewId)`
 * — the feed's own pager block ([ReviewClipPager], moved out of the feed unchanged) over the
 * PROFILE's clips: the signed-in user's `getMine()` or an author's `getFeed(userId=…, latest)`,
 * never the discovery feed — starting on the tapped clip (web parity `ClipViewer({posts,startIndex})`).
 *
 * The pure pieces (initial page, source detection for the argument-less Feed destination) run for
 * real; the nav/composition inventory is pinned by a source read like the neighbouring tests (the
 * ViewModel takes the concrete AuthRepository, so it is not constructible here).
 */
class ProfileClipsTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private val nav get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")
    private val screens get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
    private val vm get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt")
    private val pager get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewClipPager.kt")
    private val profileClips get() = screens.substring(screens.indexOf("internal fun ProfileClipsScreen("), screens.indexOf("private fun FeedTabs("))
    private val feedScreen get() = screens.substring(screens.indexOf("internal fun ReviewsFeedScreen("), screens.indexOf("internal fun ProfileClipsScreen("))

    // ── 1 + 2: the grids open the pager on the tapped clip, scoped to that profile ──

    @Test
    fun `the Self Profile tile opens ProfileClips with userId null and the tapped id`() {
        val self = nav.substring(nav.indexOf("composable<ReviewsRoute.SelfProfile>"), nav.indexOf("composable<ReviewsRoute.EditProfile>"))
        assertTrue(self.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))"))
        // A POST tile never opens the detail. Detail appears in this block only for the two personal
        // collections that have no pager source (liked, shared) — the Tôi hub's own rule.
        val postOpener = self.substringAfter("onReviewClick = { reviewId ->").substringBefore("},")
        assertFalse(postOpener.contains("ReviewsRoute.Detail"))
        assertTrue(self.substringAfter("onCollectionReviewClick = { collection, reviewId ->").substringBefore("\n                },").contains("CreatorProfileTab.Liked, CreatorProfileTab.Shared ->\n                            navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))"))
    }

    @Test
    fun `the Author Profile tile opens ProfileClips with that author's id and the tapped id`() {
        val author = nav.substring(nav.indexOf("composable<ReviewsRoute.AuthorProfile>"), nav.indexOf("composable<ReviewsRoute.ProfileClips>"))
        assertTrue(author.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = route.userId, startReviewId = reviewId))"))
        val authorPostOpener = author.substringAfter("onReviewClick = { reviewId ->").substringBefore("},")
        assertFalse(authorPostOpener.contains("ReviewsRoute.Detail"))
        assertFalse("another creator's tiles never open the detail; only the is_self collections may", author.substringBefore("onCollectionReviewClick").contains("ReviewsRoute.Detail"))
        val route = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt")
        assertTrue(Regex("""@Serializable data class ProfileClips\(\s*val userId: String\?,\s*val startReviewId: String,[\s\S]*?val saved: Boolean = false,\s*\) : ReviewsRoute""").containsMatchIn(route))
    }

    // ── 3 + 4 + 5 + 11: what each source loads, and what it never loads ──

    @Test
    fun `the own-profile source loads getMine and nothing else`() {
        val load = vm.substring(vm.indexOf("private suspend fun loadPage("), vm.indexOf("private val ReviewsFeedSource.isMine"))
        val profile = load.substring(load.indexOf("is ReviewsFeedSource.Profile ->"))
        assertTrue(profile.contains("null -> if (pageIndex == 0) repository.getMine() else NetworkResult.Success(emptyList())"))
        assertTrue("one unpaged call, so the pager never asks for a page 2", vm.contains("endReached = source.isMine || result.data.size < PAGE_SIZE"))
    }

    @Test
    fun `the author source loads that author's latest posts through the profile feed`() {
        val load = vm.substring(vm.indexOf("private suspend fun loadPage("), vm.indexOf("private val ReviewsFeedSource.isMine"))
        val profile = load.substring(load.indexOf("is ReviewsFeedSource.Profile ->"))
        assertTrue(profile.contains("""else -> repository.getFeed(page = pageIndex, limit = PAGE_SIZE, sort = "latest", userId = userId)"""))
    }

    @Test
    fun `a profile source never calls the discovery feed - no sort tab, no following, no trending`() {
        val load = vm.substring(vm.indexOf("private suspend fun loadPage("), vm.indexOf("private val ReviewsFeedSource.isMine"))
        val profile = load.substring(load.indexOf("is ReviewsFeedSource.Profile ->"))
        assertFalse(profile.contains("sortFor(") || profile.contains("following") || profile.contains("trending"))
        assertTrue("every Profile branch passes a userId or calls getMine", profile.contains("userId = userId") && profile.contains("getMine()"))
        assertFalse("no other network call from loadPage", Regex("""repository\.(?!getFeed|getMine)\w+\(""").containsMatchIn(load))
    }

    @Test
    fun `the Explore feed still loads the discovery feed with the tab's sort and following`() {
        val load = vm.substring(vm.indexOf("private suspend fun loadPage("), vm.indexOf("private val ReviewsFeedSource.isMine"))
        val explore = load.substring(load.indexOf("ReviewsFeedSource.Explore ->"), load.indexOf("is ReviewsFeedSource.Profile ->"))
        assertTrue(explore.contains("repository.getFeed(page = pageIndex, limit = PAGE_SIZE, sort = sortFor(type), following = followingFor(type))"))
        assertFalse(explore.contains("userId"))
        assertEquals("the Feed destination carries no arguments → Explore", ReviewsFeedSource.Explore, sourceFrom(SavedStateHandle()))
        assertEquals(ReviewsFeedSource.Explore, sourceFrom(SavedStateHandle(mapOf("something" to "else"))))
        assertTrue("ProfileClips arguments → Profile", vm.contains("""if (savedStateHandle.contains("startReviewId"))""")
            && vm.contains("if (route.saved) ReviewsFeedSource.Saved else ReviewsFeedSource.Profile(userId = route.userId)"))
    }

    // ── 6 + 7: the tapped clip is the first page; a vanished clip falls back to the first row ──

    @Test
    fun `startReviewId resolves to that row's index`() {
        val rows = SEED_REVIEWS.take(3)
        assertEquals(0, initialPageFor(rows, rows[0].id))
        assertEquals(1, initialPageFor(rows, rows[1].id))
        assertEquals(2, initialPageFor(rows, rows[2].id))
    }

    @Test
    fun `an unknown startReviewId opens page 0`() {
        assertEquals(0, initialPageFor(SEED_REVIEWS.take(3), "gone"))
        assertEquals(0, initialPageFor(emptyList(), "anything"))
        assertTrue("the screen composes the pager only once the list is loaded, starting there",
            profileClips.contains("initialPage = initialPageFor(reviews, startReviewId),"))
        assertTrue(profileClips.indexOf("reviews.isEmpty() ->") < profileClips.indexOf("rememberPagerState("))
    }

    // ── 8 + 10: the pager pages the ViewModel's rows only; Detail is still there for its callers ──

    @Test
    fun `the pager contains only the source's rows and the profile screen hands it exactly those`() {
        assertTrue("every page is one of the rows handed in; the page count is the state's (built from those rows)", pager.contains("val review = reviews[page]") && pager.contains("state = pagerState,"))
        assertFalse("the pager fetches nothing itself", pager.contains("repository") || pager.contains("getFeed") || pager.contains("getMine"))
        assertTrue(profileClips.contains("reviews = reviews,") && profileClips.contains("val reviews = uiState.reviews"))
        assertFalse("no Explore state leaks in: no tabs, no feed-type switch", profileClips.contains("FeedTabs(") || profileClips.contains("onFeedTypeChange"))
    }

    @Test
    fun `Detail remains for Notifications, Search and deep links`() {
        assertTrue(nav.contains("composable<ReviewsRoute.Detail> { entry ->"))
        val notifications = nav.substring(nav.indexOf("composable<ReviewsRoute.Notifications>"), nav.indexOf("composable<ReviewsRoute.Search>"))
        val search = nav.substring(nav.indexOf("composable<ReviewsRoute.Search>"))
        assertTrue(notifications.contains("navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))"))
        assertTrue(search.contains("navController.navigate(ReviewsRoute.Detail(reviewId = review.id))"))
        assertTrue(src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt").contains("data class Detail(val reviewId: String) : ReviewsRoute"))
    }

    // ── 9 + 12: the comment button in the profile pager is the sheet, not Detail ──

    @Test
    fun `comment in the profile pager opens the sheet over the pager, never Detail`() {
        assertTrue(pager.contains("onComment = { commentsFor = review.id },"))
        assertTrue(pager.contains("ReviewCommentSheet("))
        assertFalse(pager.contains("navigate(") || pager.contains("Detail"))
        // Both screens compose the same block, so the sheet fix applies to both.
        assertTrue(feedScreen.contains("ReviewClipPager(") && profileClips.contains("ReviewClipPager("))
    }

    // ── extraction, not a rewrite: the moved block is the feed's ──

    @Test
    fun `ReviewClipPager is the feed's block moved out - same card wiring, audio default, analytics`() {
        for (line in listOf(
            "beyondViewportPageCount = 1,",
            "isMe = currentUserId != null && review.userId == currentUserId,",
            "active = pagerState.settledPage == page,",
            "audioUnlocked = audioUnlocked,",
            "onVideoDuration = { viewModel.onVideoDuration(review.id, it) },",
            "onRequestAudioUnlock = { audioUnlocked = true },",
            "onLike = { viewModel.toggleLike(review) },",
            "onSave = { viewModel.toggleSave(review) },",
            "onShare = { shareScope.launch { shareReview(context, review) } },",
            "onAvatarClick = { onAuthorClick(review.userId) },",
            "onDelete = { viewModel.deleteReview(review) },",
            "onHide = { viewModel.hideReview(review) },",
            "var audioUnlocked by rememberSaveable { mutableStateOf(true) }",
            "viewModel.onPageSettled(pagerState.currentPage)",
            "viewModel.onActiveReviewChanged(activeReview)",
            "onDispose { viewModel.flushWatch() }",
            "if (count != null) viewModel.setCommentCount(reviewId, count)",
        )) assertTrue(line, pager.contains(line))
        assertFalse("the feed screen no longer holds a copy", feedScreen.contains("VerticalPager(") || feedScreen.contains("ReviewCard("))
        assertFalse("no second player or audio path", pager.contains("ExoPlayer.Builder") || pager.contains("setVolume") || pager.contains("MediaItem"))
    }
}
