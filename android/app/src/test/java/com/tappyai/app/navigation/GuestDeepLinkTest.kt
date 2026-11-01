package com.tappyai.app.navigation

import com.tappyai.features.auth.data.AuthSessionState
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Found on the emulator 02/11 (owner: "Sửa luôn"): a fresh install opened by sharing text into Tappy stayed on Login, and
 * «Tiếp tục với tư cách Khách» did nothing.
 *
 * The shared text is a pending deep link (chat with prefill). The deep-link effect navigated only for `Authenticated`, and the guest
 * redirect (`EnterShell`) stands aside whenever a deep link is pending - so a GUEST session (`Anonymous`, minted at launch) was handed
 * to neither, and the guest button could not help: the anonymous session already existed, so tapping it changed no state.
 *
 * A guest session is a usable session (the app's own rule for EnterShell): a pending deep link opens for it too.
 */
class GuestDeepLinkTest {

    @Test fun `a pending deep link opens for a signed-in account and for a guest, not before a session exists`() {
        assertTrue(deepLinkReady(AuthSessionState.Authenticated))
        assertTrue(deepLinkReady(AuthSessionState.Anonymous))
        assertFalse(deepLinkReady(AuthSessionState.Unauthenticated))
        assertFalse(deepLinkReady(AuthSessionState.Loading))
    }

    @Test fun `the host's deep-link effect uses it`() {
        var dir: File? = File(".").absoluteFile
        var host: String? = null
        while (dir != null && host == null) {
            val f = File(dir, "app/src/main/java/com/tappyai/app/navigation/AppNavHost.kt")
            if (f.isFile) host = f.readText()
            dir = dir.parentFile
        }
        // inside the app: the deep-link effect; on an auth screen: the login transition opens it (one owner, one navigation)
        assertTrue(host!!.contains("if (deepLinkReady(sessionState) && !navController.currentDestination.isAuthScreen()) {"))
        assertTrue(host.contains("navController.navigate(link) { popUpTo(navController.graph.id) { inclusive = true } }"))
    }
}
