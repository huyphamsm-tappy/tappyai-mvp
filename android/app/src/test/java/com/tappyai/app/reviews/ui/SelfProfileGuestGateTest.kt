package com.tappyai.app.reviews.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Explore → person button while NOT signed in (UAT 2026-09-17): the self profile must be a
 * sign-in gate, never an "Ẩn danh" profile with "Sửa hồ sơ", stats, saved rows and a compose entry.
 *
 * Root cause pinned here: an ANONYMOUS Supabase session is a real `auth.users` row with a real
 * `sub`, so `currentUserId()` is non-null for a guest and the profile loaded as a user. The rule
 * is now the one the Inbox and the Social page already apply — a verified NON-anonymous identity.
 */
class SelfProfileGuestGateTest {

    private val dir = File("src/main/java/com/tappyai/app/reviews/ui")
    private fun src(name: String) = File(dir, name).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    // ── The rule ──

    @Test
    fun `an anonymous session is a guest even though it has a user id`() {
        assertFalse(selfProfileAccess(userId = "anon-uuid", anonymous = true))
        assertFalse(selfProfileAccess(userId = null, anonymous = true))
        assertFalse(selfProfileAccess(userId = null, anonymous = false))
        assertTrue(selfProfileAccess(userId = "real-uuid", anonymous = false))
    }

    @Test
    fun `the guest state carries nothing personal`() {
        val guest = SelfProfileUiState(isLoading = false, isSignedIn = false)
        assertNull(guest.profile)
        assertEquals(emptyList<Any>(), guest.posts)
        assertNull(guest.saved)
        assertNull(guest.userId)
        assertNull(guest.bio)
        assertNull(guest.isPro)
        assertNull(guest.error)
        assertNull("unresolved until the token is read", SelfProfileUiState().isSignedIn)
    }

    // ── The view model ──

    @Test
    fun `load resolves the identity every time and a guest gets a cleared state with no request`() {
        val vm = src("SelfProfileViewModel.kt")
        val load = vm.substringAfter("fun load()").substringBefore("private companion object")
        assertTrue("the anonymous claim is read off the main thread", load.contains("val anonymous = withContext(Dispatchers.IO) { authRepository.isAnonymous() }"))
        assertTrue("the rule, not a bare userId check", load.contains("if (userId == null || !selfProfileAccess(userId, anonymous)) {"))
        val gate = load.substringAfter("!selfProfileAccess(userId, anonymous)) {").substringBefore("return@launch")
        assertTrue("the whole state is replaced, so a pre-sign-out profile cannot linger", gate.contains("_uiState.update { SelfProfileUiState(isLoading = false, isSignedIn = false) }"))
        assertFalse("no repository call for a guest", gate.contains("repository."))
        assertFalse("no 'session expired' error dressed up as a profile", gate.contains("reviews_error_session_expired"))
        assertTrue("a signed-in user is marked so and loaded as before", load.contains("isSignedIn = true") && load.contains("repository.getUserProfile(userId)") && load.contains("repository.getMine()"))
    }

    // ── The screen ──

    @Test
    fun `the screen gates BEFORE loading or drawing anything personal, and offers the existing Login`() {
        val s = src("SelfProfileScreen.kt")
        val body = s.substringAfter("internal fun SelfProfileScreen(").substringBefore("internal fun ReviewProfileScreen(")
        val gateAt = body.indexOf("uiState.isSignedIn == false -> SelfProfileSignedOut(onSignIn)")
        val loadingAt = body.indexOf("uiState.isLoading && uiState.profile == null ->")
        val contentAt = body.indexOf("CreatorProfileContent(")
        assertTrue("the gate is the first branch", gateAt in 1 until loadingAt && loadingAt < contentAt)
        assertTrue("re-resolved on every resume, so sign-in/out elsewhere is reflected on return", body.contains("ReloadOnResume { viewModel.load() }"))
        val signedOut = s.substringAfter("private fun SelfProfileSignedOut(").substringBefore("\n}\n")
        assertTrue(signedOut.contains("R.string.reviews_self_profile_sign_in_title") && signedOut.contains("R.string.reviews_self_profile_sign_in_body"))
        assertTrue("the existing sign-in pill and route (root Login), like the Inbox", signedOut.contains("V3AccentPill(text = stringResource(R.string.settings_sign_in), onClick = onSignIn"))
        listOf("Sửa hồ sơ", "reviews_self_edit", "CreatorProfileContent", "onEditProfile", "onCompose", "Stat(", "reviews_anonymous_name", "CreatorCollections").forEach {
            assertFalse("the guest state must not draw $it", signedOut.contains(it))
        }
        assertTrue("the nav host routes the pill up to the root graph's Login", src("ReviewsNavHost.kt").contains("onSignIn = onSignIn,\n            )\n        }\n\n        composable<ReviewsRoute.EditProfile>"))
        val vi = File("src/main/res/values-vi/strings_reviews.xml").readText()
        val en = File("src/main/res/values/strings_reviews.xml").readText()
        listOf("reviews_self_profile_sign_in_title", "reviews_self_profile_sign_in_body").forEach { assertTrue(it, vi.contains("\"$it\"") && en.contains("\"$it\"")) }
        assertTrue(vi.contains("<string name=\"reviews_self_profile_sign_in_title\">Đăng nhập để xem hồ sơ của bạn</string>"))
    }
}
