package com.tappyai.app.auth

import com.tappyai.features.auth.data.ZaloSignInClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Zalo sign-in on Android: open one backend URL, wait for one deep link. Nothing else.
 *
 * 🚨 WHAT CHANGED ON 2026-09-26. The backend used to hand the Zalo access token to the browser in
 * a URL fragment, because `graph.zalo.me/v2.0/me` answers only Vietnamese IP addresses and the
 * device's own connection was the cheapest Vietnamese one available. On Android that browser is a
 * Chrome Custom Tab — the user's real Chrome, with its real history and sync. Measured on the web
 * the same day: `history.replaceState` did NOT remove the token from Chrome's history database.
 *
 * The backend now resolves the identity through its own verifier in Vietnam, so the flow ends at
 * `/auth/confirm?platform=android`, which redirects to `tappyai://auth-callback` carrying a
 * SUPABASE session. These tests pin that Android asks for exactly that flow and that no Zalo
 * token, and no piece of the deleted browser leg, survives anywhere in the Android sources.
 */
class ZaloLoginFlowTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }

    private fun raw(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")

    /** Source with comments removed — prose may name the old endpoints to explain why they are gone. */
    private fun code(rel: String): String = raw(rel)
        .replace(Regex("(?s)/\\*.*?\\*/"), "")
        .replace(Regex("(?m)^\\s*//.*$"), "")

    private fun kotlinSources(): List<File> = root().walkTopDown()
        .onEnter { it.name != "build" && it.name != ".gradle" }
        .filter { it.isFile && it.extension == "kt" }
        .toList()

    private val zaloClient = "features/auth/src/main/java/com/tappyai/features/auth/data/ZaloSignInClient.kt"

    // ── The one URL the app opens ──

    @Test
    fun `sign-in opens the backend flow with the android platform marker`() {
        assertEquals(
            "https://uat.tappyai.com/api/auth/zalo?platform=android&returnTo=/",
            ZaloSignInClient("https://uat.tappyai.com/").loginUrl(),
        )
    }

    @Test
    fun `the platform marker is what selects the app's own redirect scheme`() {
        // Without it the backend finishes on the web and the app never gets a session.
        val url = ZaloSignInClient("https://www.tappyai.com/").loginUrl()
        assertTrue(url, url.contains("platform=android"))
        assertTrue(url, url.startsWith("https://www.tappyai.com/api/auth/zalo?"))
    }

    // ── Nothing of the browser leg is left ──

    @Test
    fun `no Kotlin source touches the deleted browser leg or a Zalo token`() {
        val gone = listOf("zalo-finish", "api/auth/zalo/complete", "zalo_at", "graph.zalo.me")
        val offenders = kotlinSources().filter { f ->
            // This file is the one place the strings are allowed: it is the list being searched for.
            f.name != "ZaloLoginFlowTest.kt"
        }.filter { f ->
            val c = code(f.relativeTo(root()).path.replace('\\', '/'))
            gone.any { c.contains(it) }
        }
        assertEquals("These files still reference the removed Zalo browser leg", emptyList<File>(), offenders)
    }

    @Test
    fun `the launcher opens a Custom Tab and does nothing else with the flow`() {
        val c = code(zaloClient)
        assertTrue("must open a Custom Tab", c.contains("CustomTabsIntent"))
        // No token handling, no OAuth secret, no session minting on-device.
        for (forbidden in listOf("access_token", "secret", "oauth.zaloapp.com", "app_id")) {
            assertTrue("$forbidden must not appear in $zaloClient", !c.contains(forbidden))
        }
    }

    // ── Where the flow comes back ──

    @Test
    fun `the app registers the deep link the backend redirects to`() {
        val manifest = raw("app/src/main/AndroidManifest.xml")
        assertTrue(manifest.contains("android:host=\"auth-callback\""))
        assertTrue(manifest.contains("android:scheme=\"tappyai\""))
    }

    @Test
    fun `the deep link is completed by the shared OAuth path, not by Zalo-specific code`() {
        // Google, Facebook and Zalo all land on the same handler; a Zalo-only branch here would be
        // a second way into an account.
        val vm = code("app/src/main/java/com/tappyai/app/navigation/AppNavHostViewModel.kt")
        assertTrue(vm.contains("handleOAuthRedirectIntent"))
        assertTrue("no Zalo-specific completion branch", !vm.lowercase().contains("zalo"))
    }
}
