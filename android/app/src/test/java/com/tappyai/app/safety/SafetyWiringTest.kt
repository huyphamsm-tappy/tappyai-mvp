package com.tappyai.app.safety

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Where the report / block / community-rules controls are wired. Source pins (the screens are
 * Compose, not unit-testable here): each asserts a property whose violation would be a Play
 * policy gap or a call to a route that production does not have.
 */
class SafetyWiringTest {

    private fun src(rel: String) = File("src/main/java/com/tappyai/app/$rel").readText().replace("\r\n", "\n")

    @Test
    fun `the rail menu offers Report and Block only on someone else's post, and only when wired`() {
        val card = src("reviews/ui/ReviewCard.kt")
        assertTrue(card.contains("if (!isMe && onReport != null)"))
        assertTrue(card.contains("if (!isMe && onBlockAuthor != null)"))
    }

    @Test
    fun `the pager draws Block only while the server supports it and a person is signed in, Report always on others' posts`() {
        val pager = src("reviews/ui/ReviewClipPager.kt")
        assertTrue(pager.contains("onReport = if (review.userId == currentUserId) null"))
        assertTrue(pager.contains("currentUserId != null && safetyFlags.userBlocks"))
        assertTrue("reports go through the production route", pager.contains("viewModel.reportReview(r, reason)"))
    }

    @Test
    fun `the feed drops reported and blocked rows at once and after every fetch, deciding end-of-feed from the raw page`() {
        val vm = src("reviews/ui/ReviewsFeedViewModel.kt")
        assertTrue(vm.contains("combine(safety.blockedIds, safety.reportedIds)"))
        assertTrue(vm.contains("reviews = result.data.visible()"))
        assertTrue(vm.contains("endReached = source.isMine || result.data.size < PAGE_SIZE"))
    }

    @Test
    fun `the dialog closes and hides the post only on an accepted report, and shows the failure otherwise`() {
        val d = src("safety/ui/SafetyDialogs.kt")
        val submit = d.substringAfter("val outcome = onSubmit(reason)").substringBefore("failure = outcome")
        assertTrue(submit.contains("if (outcome.removesFromFeed())"))
        assertTrue(submit.contains("onFiled(outcome)") && submit.contains("onDismiss()"))
        assertTrue("support address shown", d.contains("SAFETY_CONTACT_EMAIL") && d.contains("mailto:"))
    }

    @Test
    fun `block and report-user are never reached without the server's flag`() {
        val repo = src("safety/SafetyRepository.kt")
        assertTrue(repo.substringAfter("suspend fun block(").substringBefore("api.block").contains("!_flags.value.userBlocks"))
        assertTrue(repo.substringAfter("suspend fun unblock(").substringBefore("api.unblock").contains("!_flags.value.userBlocks"))
        assertTrue(repo.substringAfter("suspend fun report(").substringBefore("api.report").contains("!_flags.value.reports"))
        val menu = src("safety/ui/AuthorSafetyMenu.kt")
        assertTrue(menu.contains("if (!flags.reports && !flags.userBlocks) return"))
    }

    @Test
    fun `Settings draws the blocked-accounts row only with the flag, before the copyright and delete rows so deletion stays last`() {
        val s = src("profile/SettingsScreen.kt")
        val iBlocked = s.indexOf("if (safetyFlags.userBlocks) {")
        val iCopyright = s.indexOf("icon = Icons.Filled.Copyright,")
        val iDelete = s.indexOf("icon = Icons.Filled.DeleteOutline,")
        assertTrue(iBlocked in 1 until iCopyright && iCopyright < iDelete)
        assertTrue(src("profile/ProfileTab.kt").contains("composable<ProfileRoute.BlockedUsers>"))
    }

    @Test
    fun `posting asks for the community rules first and submits only after agreement`() {
        val h = src("reviews/ui/ReviewsScreens.kt")
        val post = h.substringAfter("onPost = {").substringBefore("photoUrls = uiState.photoUrls")
        assertTrue(post.contains("if (safetyViewModel.termsAccepted)") && post.contains("else showTerms = true"))
        val agree = h.substringAfter("UgcTermsDialog(").substringBefore("ReviewComposerScreen(")
        assertTrue(agree.contains("safetyViewModel.acceptTerms()") && agree.contains("viewModel.submit("))
        assertEquals("one post-creation path", 1, Regex("""repository\.createReview\(""").findAll(src("reviews/ui/ReviewComposerViewModel.kt")).count())
    }

    @Test
    fun `the terms dialog links the Terms of Service and names the support address`() {
        val d = src("safety/ui/SafetyDialogs.kt")
        assertTrue(d.contains("/terms"))
        val terms = d.substringAfter("fun UgcTermsDialog")
        assertTrue(terms.contains("SAFETY_CONTACT_EMAIL") && terms.contains("safety_terms_agree"))
    }

    @Test
    fun `comment reports and blocked comments are wired through the detail view model`() {
        val vm = src("reviews/ui/ReviewDetailViewModel.kt")
        assertTrue(vm.contains("withoutBlocked(safety.blockedIds.value"))
        assertTrue(vm.contains("safety.report(ReportTarget.Comment"))
        assertTrue(src("reviews/ui/ReviewCommentSheet.kt").contains("if (safetyFlags.reports)"))
        assertTrue(src("reviews/ui/ReviewsScreens.kt").contains("if (safetyFlags.reports)"))
    }
}
