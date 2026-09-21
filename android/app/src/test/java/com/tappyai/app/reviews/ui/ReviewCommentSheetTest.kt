package com.tappyai.app.reviews.ui

import com.tappyai.app.reviews.data.CommentDto
import com.tappyai.app.reviews.data.PostCommentResponseDto
import com.tappyai.app.reviews.data.ProfileDto
import com.tappyai.app.reviews.data.SEED_REVIEWS
import com.tappyai.app.reviews.data.toPosted
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Explore feed → rail comment button → comment sheet OVER the pager (UAT 2026-09-13).
 *
 * Before: the button navigated to `ReviewsRoute.Detail`, a full-screen route that replaced the
 * feed, so continuing to the next clip needed Back. Now the sheet is a `ModalBottomSheet` mounted
 * inside `ReviewsFeedScreen` — the `VerticalPager` stays composed on its page — reusing the detail
 * screen's comment list/composer and its ViewModel (keyed per review), and the server's comment
 * count flows back into the feed row. The pure pieces (DTO → domain, the feed row transform) are
 * driven for real; the composition/nav inventory is pinned by a source read, as the neighbouring
 * Explore/Self Profile tests do (the ViewModels take the concrete AuthRepository, so they are not
 * constructible here).
 */
class ReviewCommentSheetTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private val screens get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
    private val feedScreen get() = screens.substring(screens.indexOf("internal fun ReviewsFeedScreen("), screens.indexOf("private fun FeedTabs("))
    /** The pager block the feed composes — moved verbatim to ReviewClipPager.kt on 2026-09-13 so a profile can reuse it. */
    private val feed get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewClipPager.kt")
    private val sheet get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewCommentSheet.kt")
    private val nav get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")
    private val detailVm get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewDetailViewModel.kt")

    // ── 1 + 2: the rail's comment button no longer leaves the feed; Detail itself is untouched ──

    @Test
    fun `the feed's comment action opens the sheet and never navigates to Detail`() {
        assertTrue(feed.contains("onComment = { commentsFor = review.id },"))
        assertFalse("no Detail navigation from the feed screen", feed.contains("onReviewClick") || feedScreen.contains("onReviewClick"))
        assertTrue("the feed composes the shared pager", feedScreen.contains("ReviewClipPager("))
        val feedRoute = nav.substring(nav.indexOf("composable<ReviewsRoute.Feed>"), nav.indexOf("composable<ReviewsRoute.SelfProfile>"))
        assertFalse("the feed destination has no path to Detail", feedRoute.contains("ReviewsRoute.Detail"))
        assertFalse(feedRoute.contains("onReviewClick"))
    }

    @Test
    fun `Detail is unchanged and the profiles open their clip pager - and a tap on the clip is still play or pause`() {
        assertTrue(nav.contains("composable<ReviewsRoute.Detail> { entry ->"))
        assertTrue(Regex("""ReviewDetailScreen\(\s*reviewId = route\.reviewId,""").containsMatchIn(nav))
        val self = nav.substring(nav.indexOf("composable<ReviewsRoute.SelfProfile>"), nav.indexOf("composable<ReviewsRoute.EditProfile>"))
        val author = nav.substring(nav.indexOf("composable<ReviewsRoute.AuthorProfile>"), nav.indexOf("composable<ReviewsRoute.Composer>"))
        // 2026-09-13 (later the same day): the profile grids open the profile clip pager, not Detail —
        // Detail stays for Notifications, Search and deep links (see ProfileClipsTest).
        assertTrue(self.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))"))
        assertTrue(author.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = route.userId, startReviewId = reviewId))"))
        val card = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewCard.kt")
        assertTrue("single tap on the clip toggles pause, as before", Regex("""onTap = \{\s*onRequestAudioUnlock\(\)\s*paused = !paused""").containsMatchIn(card))
        // The detail screen keeps its own inline composer and list — the sheet borrowed them, not moved them.
        val detail = screens.substring(screens.indexOf("internal fun ReviewDetailScreen("), screens.indexOf("internal fun ReloadOnResume("))
        assertTrue(detail.contains("ReviewCommentInputBar(") && detail.contains("reviewCommentItems("))
    }

    // ── 3: the sheet is for the tapped review, with its own state per review ──

    @Test
    fun `the sheet opens for the tapped review id and keys its ViewModel by that id`() {
        assertTrue(Regex("""commentsFor\?\.let \{ reviewId ->\s*ReviewCommentSheet\(\s*reviewId = reviewId,""").containsMatchIn(feed))
        assertTrue(feed.contains("var commentsFor by rememberSaveable { mutableStateOf<String?>(null) }"))
        assertTrue(sheet.contains("viewModel: ReviewDetailViewModel = hiltViewModel(key = \"comments:\$reviewId\")"))
        assertTrue(sheet.contains("LaunchedEffect(reviewId) { viewModel.load(reviewId) }"))
        assertTrue("a real ModalBottomSheet, expanded, IME-aware", sheet.contains("ModalBottomSheet(") && sheet.contains("skipPartiallyExpanded = true") && sheet.contains(".imePadding()"))
    }

    // ── 4 + 5: the pager is still there under the sheet, and dismiss leaves it alone ──

    @Test
    fun `the pager stays composed under the sheet - the sheet is a sibling inside the feed, not a route`() {
        val pagerAt = feed.indexOf("VerticalPager(")
        val sheetAt = feed.indexOf("ReviewCommentSheet(")
        assertTrue(pagerAt > 0 && sheetAt > pagerAt)
        assertFalse("the sheet knows nothing about navigation", sheet.contains("navController") || sheet.contains("navigate("))
        assertFalse("no route was added for it", src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt").contains("Comment"))
        assertFalse(nav.contains("ReviewCommentSheet"))
    }

    @Test
    fun `dismissing the sheet clears the selection and writes the count - the pager page is not touched`() {
        val dismiss = feed.substring(feed.indexOf("onDismiss = { count ->"), feed.indexOf("commentsFor = null") + "commentsFor = null".length)
        assertTrue(dismiss.contains("if (count != null) viewModel.setCommentCount(reviewId, count)"))
        assertFalse(dismiss.contains("pagerState") || dismiss.contains("scrollToPage") || dismiss.contains("refresh"))
        assertTrue("the pager state is the feed's remembered one, handed in", feedScreen.contains("val pagerState = rememberPagerState(pageCount = { reviews.size })") && feed.contains("pagerState: PagerState,"))
        assertTrue(sheet.contains("val dismiss = { onDismiss(uiState.review?.commentCount) }"))
    }

    // ── 6 + 11: the server's count survives the DTO → domain hop ──

    @Test
    fun `postComment keeps the server count - the DTO parses comment and count and maps both`() {
        val json = Json { ignoreUnknownKeys = true }
        val dto = json.decodeFromString<PostCommentResponseDto>(
            """{"comment":{"id":"c9","body":"ngon","created_at":"2026-09-13T02:00:00Z","user_id":"u1","profiles":{"full_name":"Huy"}},"count":7,"ok":true}""",
        )
        assertEquals(7, dto.count)
        val posted = dto.toPosted()
        assertEquals("c9", posted.comment.id)
        assertEquals("ngon", posted.comment.body)
        assertEquals("Huy", posted.comment.profiles?.fullName)
        assertNull(posted.comment.parentCommentId)
        assertEquals(7, posted.count)
        assertEquals(0, json.decodeFromString<PostCommentResponseDto>("""{"comment":{"id":"c1"}}""").toPosted().count)
        val repo = src("app/src/main/java/com/tappyai/app/reviews/data/RealReviewsRepository.kt")
        assertTrue(repo.contains("PostCommentRequestDto(body = body, parentId = parentId)).toPosted()"))
    }

    @Test
    fun `a 2xx without a comment is a contract violation, not a silent success`() {
        assertThrows(IllegalStateException::class.java) { PostCommentResponseDto(comment = null, count = 3).toPosted() }
        val dto = PostCommentResponseDto(comment = CommentDto(id = "c2", profiles = ProfileDto(fullName = null)), count = 2)
        assertNull(dto.toPosted().comment.profiles?.fullName)
    }

    // ── 7 + 8: the detail ViewModel applies the count on success and leaves state alone on failure ──

    @Test
    fun `a successful post appends the comment and sets the review's count from the server`() {
        val post = detailVm.substring(detailVm.indexOf("fun postComment("), detailVm.indexOf("fun startReply("))
        assertTrue(post.contains("comments = it.comments + result.data.comment,"))
        assertTrue(post.contains("review = it.review?.copy(commentCount = result.data.count),"))
        assertTrue(post.contains("replyingTo = null,"))
    }

    @Test
    fun `a failed post keeps the list and the count and reports CommentFailed`() {
        val post = detailVm.substring(detailVm.indexOf("fun postComment("), detailVm.indexOf("fun startReply("))
        val failure = post.substring(post.indexOf("is NetworkResult.Error ->"))
        assertTrue(failure.contains("_uiState.update { it.copy(isPostingComment = false) }"))
        assertTrue(failure.contains("_events.send(DetailEvent.CommentFailed("))
        assertFalse(failure.contains("commentCount") || failure.contains("comments ="))
    }

    // ── 9: the feed writes the count into exactly one row ──

    @Test
    fun `withCommentCount changes the one row and hands every other row back as the same object`() {
        val rows = SEED_REVIEWS.take(3)
        val target = rows[1]
        val out = rows.withCommentCount(target.id, target.commentCount + 5)
        assertEquals(target.commentCount + 5, out[1].commentCount)
        assertEquals(target.copy(commentCount = target.commentCount + 5), out[1])
        assertSame(rows[0], out[0])
        assertSame(rows[2], out[2])
        assertEquals("an unknown id changes nothing", rows, rows.withCommentCount("nope", 99))
        assertSame("an equal count is a no-op for that row too", rows[1], rows.withCommentCount(target.id, target.commentCount)[1])
        val vm = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt")
        assertTrue(vm.contains("fun setCommentCount(reviewId: String, count: Int) {"))
        assertTrue(vm.contains("state.copy(reviews = state.reviews.withCommentCount(reviewId, count))"))
        assertFalse("no reload for a count", vm.substring(vm.indexOf("fun setCommentCount(")).substringBefore("private inline fun updateReview").contains("load"))
    }

    // ── 10: reply, reaction and delete go through the same ViewModel calls as Detail ──

    @Test
    fun `reply, reaction and own-comment delete in the sheet are the detail screen's own calls`() {
        for (call in listOf("onDeleteComment = viewModel::deleteComment", "viewModel.startReply(comment)", "viewModel.toggleReaction(id, key)", "onCancelReply = viewModel::cancelReply", "onSend = viewModel::postComment")) {
            assertTrue("sheet: $call", sheet.contains(call))
            assertTrue("detail: $call", screens.contains(call))
        }
        assertTrue("the shared list builder, not a copy", sheet.contains("reviewCommentItems(") && sheet.contains("ReviewCommentInputBar("))
        // Delete still syncs the count from the server (unchanged), so the dismiss count is right after a delete too.
        assertTrue(detailVm.contains("s.copy(review = s.review?.copy(commentCount = result.data))"))
    }
}
