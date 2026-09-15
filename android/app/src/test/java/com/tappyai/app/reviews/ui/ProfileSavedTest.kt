package com.tappyai.app.reviews.ui

import androidx.lifecycle.SavedStateHandle
import com.tappyai.app.reviews.data.ReviewDto
import com.tappyai.app.reviews.data.toDomain
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The self profile's "Đã lưu" segment (2026-09-13). Backed by the two web routes that already
 * exist — `GET /api/reviews/saved` (the Saved hub's list, keyed on the bearer: self-only by
 * construction) and `GET /api/reviews/[id]` (the full row the pager plays) — and nothing else.
 * "Đã thích" is NOT drawn: the web reads `review_likes` straight from Supabase; there is no API.
 *
 * Source reads pin the contract (Hilt + NavController screens, as in the sibling tests); the DTO
 * mapping of the route's reduced rows and `sourceFrom` run for real.
 */
class ProfileSavedTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private val api get() = src("app/src/main/java/com/tappyai/app/reviews/data/ReviewsApi.kt")
    private val repo get() = src("app/src/main/java/com/tappyai/app/reviews/data/RealReviewsRepository.kt")
    private val screen get() = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileScreen.kt")
    private val selfVm get() = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileViewModel.kt")
    private val feedVm get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt")
    private val nav get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")

    // ── the backend contract: existing routes only ──

    @Test
    fun `the saved list and the single review are the web's existing routes - no new endpoint, no liked endpoint`() {
        assertTrue(api.contains("""@GET("api/reviews/saved")""") && api.contains("suspend fun getSaved(): FeedResponseDto"))
        assertTrue(api.contains("""@GET("api/reviews/{id}")""") && api.contains("""suspend fun getReview(@Path("id") reviewId: String): ReviewDto"""))
        assertFalse("no liked list on Android: the web has no API for it", api.contains("getLiked(") || api.contains("api/reviews/liked"))
        assertFalse("the saved route takes no user parameter — it is the bearer's own list", Regex("""getSaved\([^)]+\)""").containsMatchIn(api))
        val web = File(generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "src/app/api/reviews/saved/route.ts").isFile }, "src/app/api/reviews/saved/route.ts").readText()
        assertTrue("the web route keys on the signed-in user, never on a query parameter", web.contains(".eq('user_id', user.id)") && !web.contains("searchParams"))
        assertTrue("the toggle is the one the rail already uses", api.contains("""@POST("api/reviews/{id}/save")"""))
    }

    @Test
    fun `the route's reduced rows parse - tile fields present, author and media absent`() {
        val json = Json { ignoreUnknownKeys = true }
        val row = json.decodeFromString<ReviewDto>(
            """{"id":"r1","place_name":"Phở Thìn","body":"ngon","photos":null,"thumbnail":"https://cdn/t.jpg","content_type":"video","created_at":"2026-09-13T00:00:00Z","saved_at":"2026-09-13T01:00:00Z"}""",
        ).toDomain()
        assertEquals("r1", row.id)
        assertEquals("https://cdn/t.jpg", row.thumbnail)
        assertEquals("", row.userId)
        assertNull("no media on a reduced row — the pager must hydrate", row.mediaUrl)
        assertNull(row.profiles)
    }

    @Test
    fun `the repository maps the list without caching reduced rows, and caches the full review`() {
        val saved = repo.substring(repo.indexOf("override suspend fun getSaved()"), repo.indexOf("override suspend fun getReview("))
        assertTrue(saved.contains("safeApiCall { api.getSaved().reviews.map { it.toDomain() } }"))
        assertFalse("a tile's row never stands in for the full review in the cache", saved.contains("reviewCache"))
        val full = repo.substring(repo.indexOf("override suspend fun getReview("), repo.indexOf("override suspend fun setHidden("))
        assertTrue(full.contains("api.getReview(reviewId).toDomain()") && full.contains("reviewCache[result.data.id] = result.data"))
    }

    // ── the profile: self-only segment, same grid ──

    @Test
    fun `the self profile loads the saved list alongside the posts, best-effort, and hands it to the content`() {
        assertTrue(selfVm.contains("val saved = async { repository.getSaved() }"))
        assertTrue("null when the call failed → the segment shows a retry, not an empty lie", selfVm.contains("saved = (savedResult as? NetworkResult.Success)?.data,"))
        assertTrue(selfVm.contains("val saved: List<Review>? = null,"))
        val self = screen.substring(screen.indexOf("internal fun SelfProfileScreen("), screen.indexOf("internal fun ReviewProfileScreen("))
        assertTrue(self.contains("onSavedReviewClick: ((String) -> Unit)? = null,"))
        assertTrue("wired only when a host can open a saved clip", self.contains("saved = onSavedReviewClick?.let { open ->") && self.contains("CreatorSavedSection(rows = uiState.saved, onReviewClick = open, onRetry = viewModel::load)"))
    }

    @Test
    fun `another creator's profile never requests or draws anyone's saves`() {
        val other = screen.substring(screen.indexOf("internal fun ReviewProfileScreen("), screen.indexOf("internal sealed interface CreatorPrimaryAction"))
        val otherBody = other.substring(other.indexOf("CreatorProfileContent(", other.indexOf("profile != null ->")))
        assertFalse("the other-creator content passes no saved section", otherBody.contains("saved ="))
        assertTrue("the self branch (server is_self) forwards the handler", other.contains("onSavedReviewClick = onSavedReviewClick,"))
        val otherVm = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewProfileViewModel.kt")
        assertFalse(otherVm.contains("getSaved"))
        val content = screen.substring(screen.indexOf("private fun CreatorProfileContent("), screen.indexOf("private fun CreatorProfileTopBar("))
        assertTrue("without a section the grid is the posts, whatever was selected", content.contains("val tab = if (saved == null) CreatorProfileTab.Posts else selectedTab"))
        assertTrue("the segment is drawn only with a section", content.contains("showSaved = saved != null,"))
    }

    @Test
    fun `the segments switch the same 3-column grid - posts or saved rows, empty and error states`() {
        val content = screen.substring(screen.indexOf("private fun CreatorProfileContent("), screen.indexOf("private fun CreatorProfileTopBar("))
        assertTrue(content.contains("var selectedTab by rememberSaveable { mutableStateOf(CreatorProfileTab.Posts) }"))
        assertTrue(content.contains("columns = GridCells.Fixed(3),"))
        assertTrue("posts branch unchanged", content.contains("PostGridTile(review = review, onClick = { onReviewClick(review.id) })"))
        assertTrue("saved rows use the same tile", content.contains("""items(items = rows, key = { "saved:" + it.id }) { review ->""") && content.contains("PostGridTile(review = review, onClick = { saved.onReviewClick(review.id) })"))
        assertTrue("empty saved copy", content.contains("R.string.reviews_self_saved_empty_title") && content.contains("Icons.Filled.BookmarkBorder"))
        assertTrue("a failed load retries", content.contains("rows == null -> item") && content.contains("onRetry = saved?.onRetry ?: {},"))
        val header = screen.substring(screen.indexOf("private fun CreatorProfileHeader("), screen.indexOf("private fun ProfileSegment("))
        val posts = header.indexOf("R.string.reviews_self_tab_posts"); val saved = header.indexOf("R.string.reviews_self_tab_saved")
        assertTrue("Bài viết | Đã lưu, in that order", posts in 1 until saved)
        for (rel in listOf("app/src/main/res/values/strings_reviews.xml", "app/src/main/res/values-vi/strings_reviews.xml")) {
            val xml = src(rel)
            for (key in listOf("reviews_self_tab_saved", "reviews_self_saved_empty_title", "reviews_self_saved_empty_message")) assertTrue("$key in $rel", xml.contains("name=\"$key\""))
        }
        assertTrue(src("app/src/main/res/values-vi/strings_reviews.xml").contains(">Đã lưu<"))
    }

    // ── a saved tile pages the saved list, on that clip ──

    @Test
    fun `a saved tile opens ProfileClips(saved = true) from both self entry points, and the pager pages the saved list`() {
        val self = nav.substring(nav.indexOf("composable<ReviewsRoute.SelfProfile>"), nav.indexOf("composable<ReviewsRoute.EditProfile>"))
        val author = nav.substring(nav.indexOf("composable<ReviewsRoute.AuthorProfile>"), nav.indexOf("composable<ReviewsRoute.ProfileClips>"))
        for (block in listOf(self, author)) assertTrue(block.contains("navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId, saved = true))"))
        // `toRoute` needs a real Bundle (no Robolectric here): the decision is pinned by source, the
        // arguments-free path by execution.
        assertEquals(ReviewsFeedSource.Explore, sourceFrom(SavedStateHandle()))
        assertTrue(feedVm.contains("""if (savedStateHandle.contains("startReviewId"))""") && feedVm.contains("if (route.saved) ReviewsFeedSource.Saved else ReviewsFeedSource.Profile(userId = route.userId)"))
        assertTrue("`saved` defaults to false, so every existing caller stays on the profile source", src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt").contains("val saved: Boolean = false,"))
        val load = feedVm.substring(feedVm.indexOf("private suspend fun loadPage("), feedVm.indexOf("private val ReviewsFeedSource.isMine"))
        assertTrue(load.contains("ReviewsFeedSource.Saved -> if (pageIndex == 0) loadSaved() else NetworkResult.Success(emptyList())"))
        val hydrate = feedVm.substring(feedVm.indexOf("private suspend fun loadSaved()"), feedVm.indexOf("private fun sortFor("))
        assertTrue("the list, then each row in full, bounded parallelism, saved order kept", hydrate.contains("repository.getSaved()") && hydrate.contains("limit.withPermit { repository.getReview(row.id) }") && hydrate.contains("Semaphore(HYDRATE_CONCURRENCY)"))
        assertTrue("a vanished row is dropped; only a total failure is reported", hydrate.contains("full.mapNotNull { (it as? NetworkResult.Success)?.data }") && hydrate.contains("if (rows.isEmpty())"))
        assertTrue("one unpaged call", feedVm.contains("get() = (this is ReviewsFeedSource.Profile && userId == null) || this is ReviewsFeedSource.Saved"))
        val screens = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        assertTrue("the pager's header says Đã lưu for the saved list", screens.contains("if (viewModel.source == ReviewsFeedSource.Saved) R.string.reviews_self_tab_saved else R.string.reviews_profile_stat_posts"))
        assertTrue("startReviewId → that row, as before", screens.contains("initialPage = initialPageFor(reviews, startReviewId)"))
    }
}
