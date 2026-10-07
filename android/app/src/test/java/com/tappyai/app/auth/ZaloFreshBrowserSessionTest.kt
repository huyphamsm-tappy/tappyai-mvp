package com.tappyai.app.auth

import com.tappyai.features.auth.data.ZaloSignInClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * ZALO ACCOUNT SWITCHING (real SM-A127F, 2026-10-06).
 *
 * Symptom: after logging out, "Tiếp tục với Zalo" always signed the SAME person back in.
 * Trace: `/api/auth/zalo` and `/api/auth/zalo/callback` answered in the same second, the Zalo app
 * was never launched, and the UAT backend held exactly one Zalo user — Zalo's authorize page
 * approved the Zalo web session already sitting in Chrome's cookie jar, which the Custom Tab shared.
 * The backend maps `zalo_<verified id>@zalo.tappyai.com` one-to-one and `claim-anonymous` only moves
 * conversations, so the identity was already fixed before TappyAI's code ran. Zalo documents no
 * re-authentication parameter, so the browser context itself must be fresh.
 *
 * The fix pinned here: the Zalo Custom Tab is EPHEMERAL (no cookies read or kept) whenever the
 * browser supports it, and nothing else about the flow changes.
 */
class ZaloFreshBrowserSessionTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "features/auth").isDirectory || File(it, "android/features/auth").isDirectory }
        .let { if (File(it, "features/auth").isDirectory) it else File(it, "android") }

    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    private val client = "features/auth/src/main/java/com/tappyai/features/auth/data/ZaloSignInClient.kt"

    // ── The URL ────────────────────────────────────────────────────────────────

    @Test
    fun `a release build opens exactly the login url - no bypass parameter`() {
        val c = ZaloSignInClient("https://www.tappyai.com/", "")
        assertEquals(c.loginUrl("st"), c.launchUrl("st"))
        assertFalse(c.launchUrl("st").contains("x-vercel"))
    }

    @Test
    fun `the uat build adds the deployment-protection bypass, url-encoded, and keeps app_state once`() {
        val c = ZaloSignInClient("https://uat.tappyai.com/", "ab/cd+ef")
        val url = c.launchUrl("abcDEF_123-x")
        assertTrue(url.startsWith("https://uat.tappyai.com/api/auth/zalo?platform=android&returnTo=/&app_state=abcDEF_123-x"))
        assertTrue(url.contains("&x-vercel-protection-bypass=ab%2Fcd%2Bef"))
        assertTrue(url.endsWith("&x-vercel-set-bypass-cookie=true"))
        assertEquals(1, Regex("app_state=").findAll(url).count())
    }

    // ── The browser context ───────────────────────────────────────────────────

    @Test
    fun `the Zalo tab is ephemeral when - and only when - the browser supports it`() {
        val s = src(client)
        assertTrue(s.contains("CustomTabsClient.isEphemeralBrowsingSupported(context, provider)"))
        assertTrue(s.contains("CustomTabsIntent.Builder().setEphemeralBrowsingEnabled(ephemeral).build()"))
        assertFalse("never forced on an unsupported browser", s.contains("setEphemeralBrowsingEnabled(true)"))
    }

    @Test
    fun `the tab goes to the same Custom Tabs provider that was asked about ephemeral support`() {
        val s = src(client)
        assertTrue(s.contains("val provider = CustomTabsClient.getPackageName(context, null)"))
        assertTrue(s.contains("tab.intent.setPackage(provider)"))
    }

    @Test
    fun `the launch opens the bypass-aware url, never a hand-built one`() {
        val s = src(client)
        assertTrue(s.contains("tab.launchUrl(context, Uri.parse(launchUrl(appState)))"))
    }

    // ── What must NOT have changed ────────────────────────────────────────────

    @Test
    fun `the device never learns or chooses the Zalo identity - no id parsing, no cookie handling`() {
        val s = src(client)
        assertFalse(s.contains("CookieManager"))
        assertFalse(s.contains("zalo_id") || s.contains("access_token"))
    }

    @Test
    fun `sign-out still ends the previous session before anything else can start`() {
        val repo = src("features/auth/src/main/java/com/tappyai/features/auth/data/AuthRepository.kt")
        val body = repo.substringAfter("suspend fun signOut()").substringBefore("}.logOnError(\"signOut\")")
        assertTrue(body.indexOf("supabaseClient.auth.signOut()") in 0 until body.indexOf("tokenProvider.clearTokens()"))
        assertTrue(body.indexOf("tokenProvider.clearTokens()") < body.indexOf("ensureAnonymousSession()"))
    }

    @Test
    fun `the callback is still verified against the app's own state before a session is imported`() {
        val repo = src("features/auth/src/main/java/com/tappyai/features/auth/data/AuthRepository.kt")
        val body = repo.substringAfter("suspend fun handleOAuthRedirectIntent(").substringBefore("logOnError(\"handleOAuthRedirectIntent\")")
        assertTrue(body.indexOf("callbackState.guard.verify(") in 0 until body.indexOf("handleDeeplinks(intent)"))
    }

    @Test
    fun `the manifest lets the app see the Custom Tabs provider, or ephemeral mode silently never happens`() {
        // Measured on the SM-A127F: without this <queries> entry (Android 11+ package visibility)
        // CustomTabsClient.getPackageName returned null -> provider=null ephemeralSupported=false,
        // and the Zalo tab quietly stayed a normal, cookie-sharing tab.
        val manifest = File(root(), "app/src/main/AndroidManifest.xml").readText()
        val queries = manifest.substringAfter("<queries>").substringBefore("</queries>")
        assertTrue(queries.contains("android.support.customtabs.action.CustomTabsService"))
    }
}
