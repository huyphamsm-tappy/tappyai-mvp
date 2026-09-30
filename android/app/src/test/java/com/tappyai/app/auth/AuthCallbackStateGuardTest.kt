package com.tappyai.app.auth

import com.tappyai.features.auth.data.AuthCallbackStateGuard
import com.tappyai.features.auth.data.AuthCallbackStateGuard.Verdict
import com.tappyai.features.auth.data.CallbackStateStorage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔒 Login CSRF on `tappyai://auth-callback` (security review 30/09, HIGH). A callback may import a
 * session ONLY for a sign-in this app started: matching state, within 5 minutes (the server I6 window), single use.
 */
class AuthCallbackStateGuardTest {

    private class MemStorage : CallbackStateStorage {
        var v: Pair<String, Long>? = null
        override fun read() = v
        override fun write(state: String, issuedAtMillis: Long) { v = state to issuedAtMillis }
        override fun clear() { v = null }
    }

    private var now = 1_000_000L
    private val storage = MemStorage()
    private val guard = AuthCallbackStateGuard(storage, { now })

    @Test fun `an unsolicited callback (no sign-in started, no state) is refused`() {
        assertEquals(Verdict.MISSING_STATE, guard.verify(null))
        assertEquals(Verdict.NO_PENDING_SIGN_IN, guard.verify("attacker-chosen-state"))
    }

    @Test fun `a callback without state is refused even while a real sign-in is pending, and the real one still works`() {
        val real = guard.issue()
        assertEquals(Verdict.MISSING_STATE, guard.verify(null))
        assertEquals(Verdict.MISSING_STATE, guard.verify(""))
        assertEquals("the pending sign-in is not burnt by the attacker's link", Verdict.ACCEPTED, guard.verify(real))
    }

    @Test fun `a wrong state is refused and does not consume the pending one`() {
        val real = guard.issue()
        assertEquals(Verdict.MISMATCH, guard.verify(real.dropLast(1) + if (real.last() == 'A') "B" else "A"))
        assertEquals(Verdict.ACCEPTED, guard.verify(real))
    }

    @Test fun `an expired state is refused and deleted`() {
        val real = guard.issue()
        now += AuthCallbackStateGuard.TTL_MS + 1
        assertEquals(Verdict.EXPIRED, guard.verify(real))
        assertNull(storage.v)
        assertEquals(Verdict.NO_PENDING_SIGN_IN, guard.verify(real))
    }

    @Test fun `the real sign-in - matching state within the TTL is accepted exactly once`() {
        val real = guard.issue()
        now += AuthCallbackStateGuard.TTL_MS - 1
        assertEquals(Verdict.ACCEPTED, guard.verify(real))
        assertNull("deleted after use", storage.v)
        assertEquals("a replay of the same callback is refused", Verdict.NO_PENDING_SIGN_IN, guard.verify(real))
    }

    @Test fun `states are 256-bit random, url-safe and a new sign-in replaces the old one`() {
        val a = guard.issue()
        val b = guard.issue()
        assertNotEquals(a, b)
        assertTrue(a, Regex("^[A-Za-z0-9_-]{43}$").matches(a))
        assertEquals(Verdict.MISMATCH, guard.verify(a))
        assertEquals(Verdict.ACCEPTED, guard.verify(b))
    }

    @Test fun `peek decides without consuming - a peeked state still verifies once`() {
        assertEquals(Verdict.MISSING_STATE, guard.peek(null))
        val real = guard.issue()
        assertEquals(Verdict.MISMATCH, guard.peek("nope"))
        assertEquals(Verdict.ACCEPTED, guard.peek(real))
        assertEquals(Verdict.ACCEPTED, guard.peek(real))
        assertEquals(Verdict.ACCEPTED, guard.verify(real))
        assertEquals(Verdict.NO_PENDING_SIGN_IN, guard.peek(real))
    }

    @Test fun `state is read from the token fragment first, then the query, percent-decoded`() {
        assertEquals("s1", AuthCallbackStateGuard.stateOf("tappyai://auth-callback#access_token=x&refresh_token=y&state=s1"))
        assertEquals("s2", AuthCallbackStateGuard.stateOf("tappyai://auth-callback?code=c&state=s2"))
        assertEquals("a-b_c", AuthCallbackStateGuard.stateOf("tappyai://auth-callback#state=a-b%5Fc"))
        assertNull(AuthCallbackStateGuard.stateOf("tappyai://auth-callback#access_token=x&refresh_token=y"))
        assertNull(AuthCallbackStateGuard.stateOf("tappyai://auth-callback#xstate=s&state="))
        assertNull(AuthCallbackStateGuard.stateOf(null))
        // The shared MOB-1 / I6 contract's name is accepted too.
        assertEquals("s3", AuthCallbackStateGuard.stateOf("tappyai://auth-callback#access_token=x&refresh_token=y&app_state=s3"))
        assertEquals("s4", AuthCallbackStateGuard.stateOf("tappyai://auth-callback?code=c&app_state=s4"))
    }

    @Test fun `Google on Android never lands on the callback - native ID token only (MOB-1)`() {
        // MOB-1: "Google chỉ nhận mã PKCE, từ chối callback chứa token". On Android Google is the
        // Credential Manager ID-token exchange — no browser, no tappyai://auth-callback at all — so a
        // token-bearing callback can only ever be Zalo's, and it needs the matching app_state.
        val google = src("features/auth/src/main/java/com/tappyai/features/auth/data/GoogleSignInClient.kt")
        assertTrue(!google.contains("auth-callback") && !google.contains("CustomTabsIntent") && !google.contains("launchUrl"))
        val repo = src("features/auth/src/main/java/com/tappyai/features/auth/data/AuthRepository.kt")
        assertTrue(repo.contains("suspend fun signInWithGoogleIdToken("))
    }

    // ── Wiring (source pins) ──

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "features/auth").isDirectory }
    private fun src(rel: String) = File(root(), rel).readText()

    @Test fun `the repository checks the state BEFORE importing any token or code, and Zalo carries it`() {
        val repo = src("features/auth/src/main/java/com/tappyai/features/auth/data/AuthRepository.kt")
        val body = repo.substringAfter("suspend fun handleOAuthRedirectIntent(").substringBefore("logOnError(\"handleOAuthRedirectIntent\")")
        val check = body.indexOf("callbackState.guard.verify(")
        assertTrue(check > 0)
        assertTrue("verify precedes the fragment import", check < body.indexOf("parseOAuthFragment(intent)"))
        assertTrue("verify precedes the PKCE exchange", check < body.indexOf("handleDeeplinks(intent)"))
        assertTrue(body.contains("throw AuthCallbackRejectedException(verdict)"))
        assertTrue(repo.contains("zaloSignInClient.launch(context, newCallbackState())"))
        assertTrue(src("features/auth/src/main/java/com/tappyai/features/auth/data/ZaloSignInClient.kt").contains("&app_state=\${java.net.URLEncoder.encode(appState, \"UTF-8\")}"))
    }

    @Test fun `a refused callback shows its own friendly message and the state file is never backed up`() {
        val vm = src("app/src/main/java/com/tappyai/app/navigation/AppNavHostViewModel.kt")
        assertTrue(vm.contains("AuthCallbackRejectedException") && vm.contains("R.string.auth_callback_refused"))
        // Refused BEFORE any navigation: an attacker's link must not open the callback screen or bounce a
        // signed-in user to Login.
        val handle = vm.substringAfter("if (uri.host == \"auth-callback\") {")
        assertTrue(handle.indexOf("isCallbackForThisApp(") in 0 until handle.indexOf("navigator.navigateTo(it)"))
        assertTrue(src("app/src/main/res/values-vi/strings_chat.xml").contains("Liên kết đăng nhập không hợp lệ hoặc đã hết hạn"))
        for (f in listOf("app/src/main/res/xml/backup_rules.xml", "app/src/main/res/xml/data_extraction_rules.xml")) {
            assertTrue(f, src(f).contains("tappy_auth_callback_state.xml"))
        }
    }
}
