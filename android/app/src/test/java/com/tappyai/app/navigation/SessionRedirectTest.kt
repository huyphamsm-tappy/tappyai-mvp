package com.tappyai.app.navigation

import com.tappyai.features.auth.data.AuthSessionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The root host's session redirect (2026-09-13). Found during the Share UAT: Explore → Share →
 * Gmail/Drive → back landed on the Home tab. Proven cause: auth-kt (3.0.3, `SetupPlatformKt.
 * addLifecycleCallbacks`) resets `sessionStatus` to `Initializing` on PROCESS stop and reloads
 * the stored session on start, so the app's `sessionState` goes `Loading → Authenticated` after
 * every external activity; `AppNavHost` then (a) took the NavHost out of composition for the
 * `Loading` and (b) navigated to `AppRoute.HomeShell` with `popUpTo(inclusive)` on the
 * `Authenticated` — unconditionally, although the user was already inside the app — rebuilding
 * the shell on its first tab.
 *
 * The decision is now [sessionRedirectFor]: a resolved session is a login only when the user is
 * on an auth screen. The table below is the contract; the composable's use of it, the cold-start
 * gate and the fixed start destination are pinned by source (the host is Hilt + NavController).
 */
class SessionRedirectTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private val host get() = src("app/src/main/java/com/tappyai/app/navigation/AppNavHost.kt")

    @Test
    fun `an authenticated session re-announced while inside the app redirects nowhere - the back stack survives`() {
        assertNull(sessionRedirectFor(AuthSessionState.Authenticated, onAuthScreen = false))
        assertNull(sessionRedirectFor(AuthSessionState.Anonymous, onAuthScreen = false))
        assertNull("a transient Loading never navigates", sessionRedirectFor(AuthSessionState.Loading, onAuthScreen = false))
        assertNull(sessionRedirectFor(AuthSessionState.Loading, onAuthScreen = true))
    }

    @Test
    fun `a session resolved on an auth screen is a login - into the app, anonymous straight to the shell`() {
        assertEquals(SessionRedirect.EnterApp, sessionRedirectFor(AuthSessionState.Authenticated, onAuthScreen = true))
        assertEquals(SessionRedirect.EnterShell, sessionRedirectFor(AuthSessionState.Anonymous, onAuthScreen = true))
    }

    @Test
    fun `unauthenticated always returns to Login - sign-out semantics unchanged`() {
        assertEquals(SessionRedirect.Login, sessionRedirectFor(AuthSessionState.Unauthenticated, onAuthScreen = false))
        assertEquals(SessionRedirect.Login, sessionRedirectFor(AuthSessionState.Unauthenticated, onAuthScreen = true))
    }

    @Test
    fun `the host decides from where the user is, keeps the login and sign-out navigations, and still gates onboarding and deep links`() {
        val effect = host.substring(host.indexOf("LaunchedEffect(sessionState) {"), host.indexOf("if (sessionState == AuthSessionState.Loading && !hasResolvedSession)"))
        assertTrue(effect.contains("when (sessionRedirectFor(sessionState, onAuthScreen = navController.currentDestination.isAuthScreen())) {"))
        assertTrue("login → onboarding gate or shell, clearing the auth graph", effect.contains("SessionRedirect.EnterApp -> {") && effect.contains("val destination = if (viewModel.needsOnboarding()) AppRoute.Onboarding else AppRoute.HomeShell"))
        assertTrue("anonymous → shell, no onboarding", effect.contains("SessionRedirect.EnterShell -> {") && effect.contains("navController.navigate(AppRoute.HomeShell) {"))
        assertTrue("sign-out → Login", effect.contains("SessionRedirect.Login -> navController.navigate(AuthRoute.Login) {"))
        assertEquals("every redirect still clears the stack down to the graph root", 3, Regex("""popUpTo\(navController\.graph\.id\) \{ inclusive = true \}""").findAll(effect).count())
        assertEquals("a pending deep link still owns both login transitions", 2, Regex("""if \(deepLinkTarget != null\) return@LaunchedEffect""").findAll(effect).count())
        assertTrue("no unconditional navigation on Authenticated remains", !effect.contains("AuthSessionState.Authenticated ->") && !effect.contains("AuthSessionState.Anonymous ->"))
        assertTrue("the three auth screens, nothing else, count as an auth screen",
            host.contains("hasRoute<AuthRoute.Login>() || hasRoute<AuthRoute.EmailOtpVerification>() || hasRoute<AuthRoute.AuthCallback>()"))
    }

    @Test
    fun `cold start still waits on the spinner, but a later Loading keeps the NavHost composed and the start destination fixed`() {
        assertTrue(host.contains("var hasResolvedSession by remember { mutableStateOf(false) }"))
        assertTrue(host.contains("if (sessionState != AuthSessionState.Loading) hasResolvedSession = true"))
        assertTrue("the spinner gate is the cold-start gate only", host.contains("if (sessionState == AuthSessionState.Loading && !hasResolvedSession) {"))
        assertFalse("no bare Loading gate is left", host.contains("if (sessionState == AuthSessionState.Loading) {"))
        val at = host.indexOf("val startDestination = remember {")
        val start = host.substring(at, host.indexOf("NavHost(", at))
        assertTrue("remembered once: Authenticated/Anonymous → shell, else Login",
            start.contains("if (sessionState == AuthSessionState.Authenticated || sessionState == AuthSessionState.Anonymous)") && start.contains("AppRoute.HomeShell") && start.contains("AuthRoute.Login"))
        assertTrue(host.contains("startDestination = startDestination,"))
        assertFalse("no delays, no lifecycle hacks, no tab hard-coding", host.contains("delay(") || host.contains("HomeTab.Explore") || host.contains("ProcessLifecycleOwner"))
    }
}
