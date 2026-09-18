package com.tappyai.app.personal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The four V3 personal surfaces (2026-09-15, from design/v3-phase4 `/planner`, `/social`,
 * `/profile/history`, `/profile`). Source-pinned, like the Fortune / Smart Tools suites:
 *  - each surface stands on the shared `personal/PersonalV3` kit and reads only real data;
 *  - no new backend: the Planner derives from `GET /api/conversations`, Following reads
 *    `GET /api/social/connections` through its own client and toggles through the existing
 *    Reviews client, History keeps the same repository, the hub composes existing repositories;
 *  - the honest omissions stay omitted (no @handle, no cover, no video / link history, no edit
 *    flow for plans, no mutual counts); the anonymous gate is respected, not weakened;
 *  - the copy is the web's, in both languages, and every key has vi + en.
 */
class PersonalSurfacesV3Test {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    /** Source with line AND block comments removed — the pins are about code, not the notes explaining it. */
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")
    private fun screen(pkg: String, file: String) = src("app/src/main/java/com/tappyai/app/$pkg/$file.kt")

    private val planner get() = screen("planner", "PlannerScreen")
    private val plannerVm get() = screen("planner", "PlannerViewModel")
    private val social get() = screen("social", "SocialScreen")
    private val socialVm get() = screen("social", "SocialViewModel")
    private val history get() = screen("history", "ChatHistoryScreen")
    private val hub get() = screen("profile", "ProfileScreen")
    private val hubV3 get() = screen("profile", "ProfileHubV3")
    private val hubVm get() = screen("profile", "ProfileHubContentViewModel")
    private val tab get() = screen("profile", "ProfileTab")

    @Test
    fun `every surface stands on the personal V3 kit, none on the Material default chrome`() {
        for ((name, s) in listOf("planner" to planner, "social" to social, "history" to history)) {
            assertTrue("$name uses V3PersonalPage", s.contains("V3PersonalPage("))
            assertFalse("$name has no TappyCard", s.contains("TappyCard("))
            assertFalse("$name has no TappyButton", s.contains("TappyButton("))
            assertFalse("$name has no MaterialTheme colours", s.contains("MaterialTheme.colorScheme"))
        }
        assertTrue(hub.contains("V3HomeTheme {") && hub.contains("ProfileHeroV3(") && hub.contains("ProfileContentV3("))
        assertTrue(hubV3.contains("V3Panel(") && hubV3.contains("V3Avatar("))
    }

    @Test
    fun `AI Planner - plans are read out of conversations, opened in place, never edited`() {
        assertTrue(plannerVm.contains("repository.getConversationsWithMessages()") && plannerVm.contains("DerivePlans.derivePlans("))
        assertFalse("no planner API", src("app/src/main/java/com/tappyai/app/history/data/ChatHistoryApi.kt").contains("planner"))
        assertTrue("the itinerary opens in place", planner.contains("AnimatedVisibility(visible = open) { Itinerary(plan) }"))
        assertTrue("open in the conversation = the existing resume", planner.contains("onOpenConversation(plan.conversationId)"))
        assertTrue("the CTA is a chat prefill, the web's /chat?q=", planner.contains("onPlanWithTappy(prompt)") && tab.contains("onPlanWithTappy = onOpenChatWithPrefill"))
        for (dead in listOf("Edit", "Duplicate", "Archive", "Regenerate")) assertFalse("no $dead control", Regex("""R\.string\.planner_\w*${dead.lowercase()}""").containsMatchIn(planner))
        assertTrue("thread activity, not a plan date", planner.contains("R.string.planner_last_activity"))
        assertTrue("the scope note", planner.contains("R.string.planner_scope"))
    }

    @Test
    fun `Following - the one social primitive, the existing toggle, the anonymous gate kept`() {
        val api = screen("social/data", "SocialApi")
        assertTrue(api.contains("@GET(\"api/social/connections\")") && api.contains("@Query(\"type\") type: String"))
        assertTrue("search + toggle stay on the Reviews client", socialVm.contains("reviewsRepository.searchUsers(q)") && socialVm.contains("reviewsRepository.toggleFollow(person.id)"))
        assertFalse("the staged Reviews API is untouched by this work", src("app/src/main/java/com/tappyai/app/reviews/data/ReviewsApi.kt").contains("social/connections"))
        assertTrue("server's answer renders", socialVm.contains("is NetworkResult.Success -> onFollowChange(person.id, result.data)"))
        assertTrue("anonymous → sign-in state", socialVm.contains("authRepository.isAnonymous()") && social.contains("false -> SignedOutState(onSignIn)"))
        assertFalse("no friend requests, suggestions, mutual counts or handles", Regex("""(?i)(mutual|friendRequest|suggested|handle|username)""").containsMatchIn(social))
        assertTrue("debounced, 2-char minimum", socialVm.contains("if (q.length < 2)") && socialVm.contains("delay(350)"))
        assertTrue("profile → the existing creator screen", tab.contains("onOpenProfile = { userId -> navController.navigate(ProfileRoute.AuthorProfile(userId)) }"))
    }

    @Test
    fun `History - the same repository and delete, the categories this client can read, the Planner link`() {
        assertTrue(history.contains("viewModel.delete(conv.id)") && history.contains("onResumeConversation(conv.id)"))
        assertTrue(history.contains("R.string.history_v3_plans_open") && history.contains("onOpenPlanner"))
        assertTrue("period filter is client-side over real rows", history.contains("private val PERIODS = listOf(7, 30, 0)"))
        assertFalse("no faked video / link rows", history.contains("history_v3_video") || history.contains("history_v3_links"))
        assertTrue("the ViewModel is unchanged", screen("history", "ChatHistoryViewModel").contains("repository.getConversations()"))
    }

    @Test
    fun `Profile hub - real fields only, the three gated routes, the same rows plus Planner and Following`() {
        val items = hub.substring(hub.indexOf("private val ACCOUNT_ITEMS"), hub.indexOf("private val CardShape"))
        val order = Regex("""add\(ProfileMenuItem\.(\w+)\)""").findAll(items).map { it.groupValues[1] }.toList()
        assertEquals(listOf("Account", "ChatHistory", "Bookings", "Preferences", "Saved", "PriceTracking", "Planner", "Social", "TappyKnows", "AppConnections", "MyReviews", "GroupDining", "UpgradeToPro"), order)
        assertTrue(hub.contains("ProfileMenuItem.Planner -> onOpenPlanner") && hub.contains("ProfileMenuItem.Social -> onOpenSocial"))
        assertTrue("guests keep the sign-in card and no content", hub.contains("if (viewModel.isAnonymous) {") && hub.contains("SignInCard(onClick = onSignIn)"))
        for (route in listOf("reviewsRepository.getMine()", "reviewsRepository.getSaved()", "savedRepository.getFavorites()", "reviewsRepository.getUserProfile(userId)", "chatHistoryRepository.getConversations()", "membershipRepository.getStatus()", "socialRepository.getConnections(ConnectionType.Following)")) {
            assertTrue(route, hubVm.contains(route))
        }
        assertFalse("no invented fields", Regex("""(handle|username|coverUrl|points|level|streak|location)""").containsMatchIn(hubV3))
        assertTrue("stats render only when sent", hubV3.contains("if (stats != null || likes != null)"))
        assertTrue("edit → the existing Account edit", tab.contains("onEditProfile = { navController.navigate(ProfileRoute.AccountEdit) }"))
        assertTrue("QR → the existing sheet", hub.contains("QrProfileSheet(userId = userId, name = viewModel.profile?.fullName, onDismiss = { showQrSheet = false })"))
    }

    @Test
    fun `copy is the web's, in both languages`() {
        val vi = src("app/src/main/res/values-vi/strings_personal_v3.xml")
        val en = src("app/src/main/res/values/strings_personal_v3.xml")
        val names = { xml: String -> Regex("""<string name="(\w+)">""").findAll(xml).map { it.groupValues[1] }.toSet() }
        assertEquals(names(vi), names(en))
        assertTrue(vi.contains("<string name=\"planner_subtitle\">Những kế hoạch Tappy đã lập cùng bạn</string>"))
        assertTrue(vi.contains("<string name=\"social_title\">Following / Followers</string>"))
        assertTrue(vi.contains("<string name=\"history_v3_tagline\">Xem lại những gì bạn đã khám phá trên TappyAI.</string>"))
        assertTrue(vi.contains("<string name=\"profile_v3_breadcrumb\">Hồ sơ / Tôi</string>"))
        val referenced = listOf(planner, social, history, hub, hubV3)
            .flatMap { Regex("""R\.string\.((planner|social|history_v3|profile_v3)_\w+)""").findAll(it).map { m -> m.groupValues[1] }.toList() }.toSet()
        val missing = referenced - names(vi) - setOf("profile_v3_subtitle")
        assertTrue("missing strings: $missing", missing.isEmpty())
    }

    @Test
    fun `Self profile collections - six real destinations, each on its own read, private to the own hub`() {
        // The enum IS the collection list. "Đã share" joined on 2026-09-15 once `review_shares` and
        // its bearer-only route existed — never before, when a share left only a telemetry event.
        assertTrue(hubVm.contains("enum class ProfileContentTab { Posts, Liked, Saved, Hidden, Shared, Places }"))
        assertTrue(hubVm.contains("ProfileContentTab.Shared -> (collectionsRepository.getShared() as? NetworkResult.Success)?.also { shared = it.data } != null"))
        // Data sources: own posts + hidden are the two halves of `/mine`; liked is the gated route; saved / favorites as before.
        assertTrue(hubVm.contains("val posts: List<Review>? get() = mine?.filterNot { it.isHidden }"))
        assertTrue(hubVm.contains("val hidden: List<Review>? get() = mine?.filter { it.isHidden }"))
        assertTrue(hubVm.contains("ProfileContentTab.Liked -> (collectionsRepository.getLiked() as? NetworkResult.Success)?.also { liked = it.data } != null"))
        assertTrue(hubVm.contains("ProfileContentTab.Saved -> (reviewsRepository.getSaved() as? NetworkResult.Success)?.also { saved = it.data } != null"))
        val api = screen("profile/data", "ProfileCollectionsApi")
        assertTrue("liked comes from the bearer-only route, through its own client", api.contains("@GET(\"api/reviews/liked\")"))
        assertFalse("the staged Reviews API is untouched", src("app/src/main/java/com/tappyai/app/reviews/data/ReviewsApi.kt").contains("reviews/liked"))
        // Identity: the authenticated session, never a hardcoded id; guests load nothing.
        assertTrue(hubVm.contains("val userId = authRepository.currentUserId()") && hubVm.contains("if (anonymous || userId == null) return@launch"))
        // Empty state per collection, and the chip labels, are one exhaustive mapping each.
        for (tab in listOf("Posts", "Liked", "Saved", "Hidden", "Shared", "Places")) {
            assertTrue("empty copy for $tab", Regex("""ProfileContentTab\.$tab -> R\.string\.profile_v3_empty_\w+""").containsMatchIn(hubV3))
            assertTrue("chip label for $tab", Regex("""ProfileContentTab\.$tab -> R\.string\.profile_v3_tab_\w+""").containsMatchIn(hubV3))
        }
        // Opening a tile reuses the EXISTING viewers: the Explore pager for own/hidden/saved, the detail for liked.
        val open = tab.substring(tab.indexOf("onOpenReview = { collection, reviewId ->"), tab.indexOf("onOpenCreator = { userId ->"))
        assertTrue(open.contains("ProfileContentTab.Posts, ProfileContentTab.Hidden ->") && open.contains("ProfileRoute.ProfileClips(userId = null, startReviewId = reviewId))"))
        assertTrue(open.contains("ProfileContentTab.Saved ->") && open.contains("ProfileRoute.ProfileClips(userId = null, startReviewId = reviewId, saved = true))"))
        assertTrue(open.contains("ProfileContentTab.Liked, ProfileContentTab.Shared, ProfileContentTab.Places ->") && open.contains("ProfileRoute.ReviewDetail(reviewId))"))
        assertTrue("the pager is the Explore feature's own screen", tab.contains("ProfileClipsScreen(") && !tab.contains("HorizontalPager("))
        val route = screen("profile", "ProfileRoute")
        val clips = route.substring(route.indexOf("data class ProfileClips("), route.indexOf(") : ProfileRoute", route.indexOf("data class ProfileClips(")))
        assertTrue("argument names mirror ReviewsRoute.ProfileClips so `sourceFrom` resolves", clips.contains("val userId: String?,") && clips.contains("val startReviewId: String,") && clips.contains("val saved: Boolean = false,"))
        // Self-only: the collections panel is drawn inside the signed-in branch of the hub, and the
        // creator profile screen knows nothing of it.
        val signedIn = hub.substring(hub.indexOf("} else {", hub.indexOf("if (viewModel.isAnonymous) {")), hub.indexOf("Column(verticalArrangement = Arrangement.spacedBy(TappySpacing.md)) {"))
        assertTrue(signedIn.contains("ProfileContentV3("))
        val creator = screen("reviews/ui", "SelfProfileScreen")
        assertFalse("creator profile has no private collections", creator.contains("ProfileContentV3") || creator.contains("getLiked") || creator.contains("ProfileContentTab"))
        assertFalse(screen("reviews/ui", "ReviewsScreens").contains("ProfileContentTab"))
    }
}
