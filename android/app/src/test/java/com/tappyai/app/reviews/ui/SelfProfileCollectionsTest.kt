package com.tappyai.app.reviews.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Explore → My Profile exposes the signed-in user's FIVE personal surfaces (UAT 2026-09-17):
 * Bài viết · Đã thích · Đã lưu · Đã ẩn · Đã share — each over the existing real source the Tôi hub
 * already reads, none for a guest, none for another creator.
 *
 * Root cause pinned: the Explore self profile carried its own two-segment `CreatorProfileTab
 * { Posts, Saved }` while the five-collection implementation (`ProfileHubContentViewModel` +
 * `ProfileCollectionsRepository`) lived only on the Tôi tab. The profile now draws all five over
 * those same repositories — no second API, no local persistence.
 */
class SelfProfileCollectionsTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun raw(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
    private fun src(rel: String): String = raw(rel)
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    private val screen get() = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileScreen.kt")
    private val vm get() = src("app/src/main/java/com/tappyai/app/reviews/ui/SelfProfileViewModel.kt")
    private val nav get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt")

    // ── 1. the five surfaces, in the product's order ──

    @Test
    fun `the signed-in self profile exposes exactly the five personal surfaces, in order`() {
        assertEquals(listOf("Posts", "Liked", "Saved", "Hidden", "Shared"), CreatorProfileTab.entries.map { it.name })
        val s = screen
        assertTrue("every segment is drawn from the enum, in one scrolling row", s.contains("val tabs = if (showCollections) CreatorProfileTab.entries else listOf(CreatorProfileTab.Posts)") && s.contains(".horizontalScroll(rememberScrollState())"))
        assertTrue(s.contains("CreatorProfileTab.Posts -> R.string.reviews_self_tab_posts") && s.contains("CreatorProfileTab.Liked -> R.string.profile_v3_tab_liked") &&
            s.contains("CreatorProfileTab.Saved -> R.string.reviews_self_tab_saved") && s.contains("CreatorProfileTab.Hidden -> R.string.profile_v3_tab_hidden") && s.contains("CreatorProfileTab.Shared -> R.string.profile_v3_tab_shared"))
        val vi = raw("app/src/main/res/values-vi/strings_reviews.xml") + raw("app/src/main/res/values-vi/strings_personal_v3.xml")
        listOf(">Bài viết<", ">Đã thích<", ">Đã lưu<", ">Đã ẩn<", ">Đã share<").forEach { assertTrue(it, vi.contains(it)) }
        assertFalse("no sixth tab invented", s.contains("CreatorProfileTab.Places"))
    }

    // ── 2. none of them for a guest ──

    @Test
    fun `an anonymous user gets the sign-in gate and no collection is fetched or drawn`() {
        val gate = vm.substringAfter("!selfProfileAccess(userId, anonymous)) {").substringBefore("return@launch")
        assertTrue(gate.contains("_uiState.update { SelfProfileUiState(isLoading = false, isSignedIn = false) }"))
        assertFalse(gate.contains("collectionsRepository") || gate.contains("repository."))
        val guest = SelfProfileUiState(isLoading = false, isSignedIn = false)
        assertNull(guest.liked); assertNull(guest.saved); assertNull(guest.shared); assertEquals(0, guest.posts.size)
        val body = screen.substringAfter("internal fun SelfProfileScreen(").substringBefore("internal fun ReviewProfileScreen(")
        assertTrue("the gate branch precedes the content", body.indexOf("uiState.isSignedIn == false -> SelfProfileSignedOut(onSignIn)") < body.indexOf("CreatorProfileContent("))
    }

    // ── 3. each collection maps to its existing real source ──

    @Test
    fun `each collection is the existing source - mine (public and hidden halves), liked, saved, shared`() {
        val load = vm.substringAfter("fun load()")
        assertTrue("Bài viết / Đã ẩn: /api/reviews/mine", load.contains("val postsResult = repository.getMine()"))
        assertTrue("Đã lưu: /api/reviews/saved", load.contains("val saved = async { repository.getSaved() }"))
        assertTrue("Đã thích: ProfileCollectionsRepository.getLiked (GET /api/reviews/liked)", load.contains("val liked = async { collectionsRepository.getLiked() }"))
        assertTrue("Đã share: ProfileCollectionsRepository.getShared (GET /api/reviews/shared)", load.contains("val shared = async { collectionsRepository.getShared() }"))
        val api = src("app/src/main/java/com/tappyai/app/profile/data/ProfileCollectionsApi.kt")
        assertTrue(api.contains("@GET(\"api/reviews/liked\")") && api.contains("@GET(\"api/reviews/shared\")"))
        val s = screen
        assertTrue("the grid splits own rows into public posts and hidden posts", s.contains("posts = publicPosts,") && s.contains("uiState.posts.filter { it.isHidden } else null,"))
        assertTrue("the stat and the grid count the SAME public rows — the number over the grid is the number of tiles in it", s.contains("val publicPosts = uiState.posts.filterNot { it.isHidden }") && s.contains("selfProfileFacts(uiState.profile, publicPosts, uiState.isPro, uiState.bio)") && s.contains("posts = publicPosts,"))
        assertTrue(s.contains("liked = uiState.liked,") && s.contains("saved = uiState.saved,") && s.contains("shared = uiState.shared,"))
        val rows = CreatorCollections(liked = listOf(), saved = null, hidden = listOf(), shared = null, onReviewClick = { _, _ -> }, onRetry = {})
        assertNull(rows.rows(CreatorProfileTab.Posts)); assertEquals(listOf<Any>(), rows.rows(CreatorProfileTab.Liked)); assertNull(rows.rows(CreatorProfileTab.Saved)); assertNull(rows.rows(CreatorProfileTab.Shared))
    }

    // ── 4. nothing fake, nothing local ──

    @Test
    fun `no fake or local-only collection data - a failed call is a retry state, never an empty list, and nothing is cached on disk`() {
        val load = vm.substringAfter("fun load()")
        assertTrue(load.contains("liked = (likedResult as? NetworkResult.Success)?.data,") && load.contains("shared = (sharedResult as? NetworkResult.Success)?.data,") && load.contains("saved = (savedResult as? NetworkResult.Success)?.data,"))
        assertFalse("liked is never copied from saved", load.contains("liked = (savedResult") || load.contains("liked = saved"))
        listOf("SharedPreferences", "DataStore", "emptyList<Review>() //", "listOf(Review(").forEach { assertFalse("$it in the view model", vm.contains(it)) }
        assertTrue("a null collection draws the retry state", screen.contains("rows == null -> item(span = { GridItemSpan(maxLineSpan) }) {\n                        TappyErrorState("))
        assertFalse("another creator's profile never requests anyone's collections", src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewProfileViewModel.kt").contains("collectionsRepository"))
    }

    @Test
    fun `a failed mine load is a retry on Bài viết and Đã ẩn, never an empty lie - the profile row alone does not vouch for the posts`() {
        val s = screen
        assertTrue(s.contains("hidden = if (uiState.postsLoaded) uiState.posts.filter { it.isHidden } else null,"))
        assertTrue(s.contains("postsFailed = !uiState.postsLoaded,") && s.contains("if (postsFailed) postsError() else emptyState()"))
        assertTrue(vm.contains("postsLoaded = posts != null,"))
        assertFalse("nothing is loaded for a guest", SelfProfileUiState(isLoading = false, isSignedIn = false).postsLoaded)
    }

    // ── 5. navigation opens the existing surface for each collection ──

    @Test
    fun `a tile opens its collection's existing surface - own or hidden pages mine, saved pages saved, liked and shared open the detail`() {
        val n = nav
        val block = n.substringAfter("onCollectionReviewClick = { collection, reviewId ->").substringBefore("\n                },")
        assertTrue(block.contains("CreatorProfileTab.Posts, CreatorProfileTab.Hidden ->\n                            navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId))"))
        assertTrue(block.contains("CreatorProfileTab.Saved ->\n                            navController.navigate(ReviewsRoute.ProfileClips(userId = null, startReviewId = reviewId, saved = true))"))
        assertTrue(block.contains("CreatorProfileTab.Liked, CreatorProfileTab.Shared ->\n                            navController.navigate(ReviewsRoute.Detail(reviewId = reviewId))"))
        assertEquals("both self-profile hosts (SelfProfile and is_self AuthorProfile) wire the same opener", 2, Regex("""onCollectionReviewClick = \{ collection, reviewId ->""").findAll(n).count())
        assertFalse("no new route was invented", src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt").contains("Liked") )
    }

    // ── 5b. the detail surface fetches an uncached row instead of calling it unavailable ──

    @Test
    fun `a liked or shared row that is not in the in-memory cache is fetched by id on the detail screen`() {
        val vm = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewDetailViewModel.kt")
        val load = vm.substringAfter("fun load(reviewId: String)").substringBefore("private fun resolveAttachedTrack")
        assertTrue(load.contains("isLoadingReview = cached == null"))
        assertTrue("GET /api/reviews/{id} when the cache has nothing", load.contains("when (val result = repository.getReview(reviewId)) {") && load.contains("_uiState.update { it.copy(review = result.data, isLoadingReview = false) }"))
        val screen = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        assertTrue("waiting is a spinner; only a failed fetch is 'unavailable'", screen.contains("if (uiState.isLoadingReview) {\n                TappyLoadingIndicator(") && screen.contains("R.string.reviews_detail_unavailable_message"))
    }

    // ── 6. logout removes access ──

    @Test
    fun `logout removes access - the identity is re-resolved on every resume and a guest state replaces everything`() {
        val body = screen.substringAfter("internal fun SelfProfileScreen(").substringBefore("internal fun ReviewProfileScreen(")
        assertTrue(body.contains("ReloadOnResume { viewModel.load() }"))
        assertTrue(vm.contains("val anonymous = withContext(Dispatchers.IO) { authRepository.isAnonymous() }"))
        assertTrue("a whole new state, not a copy — liked/saved/shared/posts all gone", vm.contains("_uiState.update { SelfProfileUiState(isLoading = false, isSignedIn = false) }"))
    }

    // ── 7. the post grid still works ──

    @Test
    fun `the existing post grid is unchanged - the Posts branch, its tile and its opener`() {
        val content = screen.substringAfter("private fun CreatorProfileContent(").substringBefore("private fun CreatorProfileTopBar(")
        assertTrue(content.contains("columns = GridCells.Fixed(3),"))
        assertTrue(content.contains("CreatorProfileTab.Posts -> {\n                if (posts.isEmpty()) {") && content.contains("PostGridTile(review = review, onClick = { onReviewClick(review.id) })"))
        assertTrue("selection survives rotation", content.contains("var selectedTab by rememberSaveable { mutableStateOf(CreatorProfileTab.Posts) }"))
        assertTrue("hidden tiles keep their veil", screen.contains("if (review.isHidden) {") && screen.contains("Icons.Filled.VisibilityOff"))
    }
}
