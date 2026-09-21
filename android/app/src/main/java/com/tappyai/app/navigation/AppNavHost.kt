package com.tappyai.app.navigation

import android.widget.Toast
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.tappyai.app.groupdining.GroupDetailScreen
import com.tappyai.app.home.HomeShellScreen
import com.tappyai.app.onboarding.OnboardingScreen
import com.tappyai.app.reviews.ui.ReviewComposerHost
import com.tappyai.app.showcase.DesignSystemShowcaseScreen
import com.tappyai.core.designsystem.component.TappyLoadingIndicator
import com.tappyai.features.auth.data.AuthSessionState
import com.tappyai.features.auth.navigation.AuthRoute
import com.tappyai.features.auth.ui.login.LoginScreen
import com.tappyai.features.auth.ui.otp.EmailOtpVerificationScreen

/**
 * The app's first real `NavHost` (Phase 1B). Collects [TappyNavigatorImpl]'s two event flows
 * to drive the actual `NavController` (see that class's doc for why the split exists), and
 * reactively switches between the auth graph and the post-auth destination based on
 * `AuthRepository.sessionState` — no ViewModel anywhere needs to know the post-auth
 * destination itself (see `LoginViewModel`'s doc comment).
 *
 * **Verify `NavController.navigate(route: Any)`'s runtime-type resolution before building** —
 * `TappyNavigatorImpl.destinations` carries the `TappyRoute` *interface* type, and this relies
 * on Navigation Compose 2.8's type-safe API resolving the serializer from the route object's
 * actual runtime class rather than the static type at the call site. This is the intended use
 * case for a generic route bus, but isn't confirmed against a live compile in this environment.
 */
@Composable
fun AppNavHost(
    isDarkTheme: Boolean,
    onToggleDarkTheme: () -> Unit,
    viewModel: AppNavHostViewModel = hiltViewModel(),
) {
    val navController = rememberNavController()
    val sessionState by viewModel.sessionState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    // A failed OAuth callback exchange (malformed/expired/reused code) previously left the user
    // stuck on AuthCallback's spinner or back on Login with zero explanation — surface it and,
    // if still sitting on the transient callback screen, send them back to Login so they can
    // retry instead of waiting on a sessionState change that will never come.
    LaunchedEffect(Unit) {
        viewModel.authError.collect { message ->
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
            if (navController.currentDestination?.hasRoute<AuthRoute.AuthCallback>() == true) {
                navController.navigate(AuthRoute.Login) {
                    popUpTo(navController.graph.id) { inclusive = true }
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        viewModel.navigator.destinations.collect { route ->
            navController.navigate(route)
        }
    }
    LaunchedEffect(Unit) {
        viewModel.navigator.backEvents.collect {
            navController.popBackStack()
        }
    }

    // Deep-link target (e.g. a shared `tappyai://group/{id}` link). Held as a retained value and
    // only acted on once authenticated — so a cold-start tap survives until the graph exists, and a
    // logged-out user is routed to the group right after they sign in. Consumed so it fires once.
    val deepLinkTarget by viewModel.deepLinkTarget.collectAsStateWithLifecycle()
    LaunchedEffect(deepLinkTarget, sessionState) {
        val route = deepLinkTarget ?: return@LaunchedEffect
        if (sessionState == AuthSessionState.Authenticated) {
            navController.navigate(route)
            viewModel.consumeDeepLink()
        }
    }

    // The first sessionState value is already reflected correctly by `startDestination`
    // below (NavHost isn't even composed until sessionState leaves Loading) — this flag
    // skips acting on that first value so cold start doesn't immediately re-navigate to
    // where it already is; only *later* transitions (login completing, sign-out) act here.
    var hasHandledInitialState by remember { mutableStateOf(false) }
    // True once the session has resolved (left Loading) for the first time — from then on the
    // NavHost stays composed and the start destination is fixed; see the two notes below.
    var hasResolvedSession by remember { mutableStateOf(false) }
    if (sessionState != AuthSessionState.Loading) hasResolvedSession = true
    LaunchedEffect(sessionState) {
        if (!hasHandledInitialState) {
            hasHandledInitialState = true
            return@LaunchedEffect
        }
        // `popUpTo(0)` is a leftover idiom from the old resource-id-based navigation API and
        // doesn't apply here — `graph.id` is the correct, type-safe-API way to clear the
        // entire back stack down to (and including) the graph root when switching between
        // the auth graph and the post-auth destination.
        //
        // WHICH transitions act is decided by [sessionRedirectFor] from WHERE the user is, not
        // only from the new state. A signed-in session is re-announced by the auth SDK every time
        // the process comes back to the foreground (auth-kt resets its status to Initializing on
        // process stop and reloads the stored session on start), so `Authenticated` arrives again
        // after every Share → Gmail/Drive → back round trip, every launcher visit, every picker.
        // That is the SAME session, not a login: the app is already inside the post-auth graph
        // and its back stack — Explore tab, the clip pager, a profile — must stay exactly as it
        // was. Only a session resolved while the user is on an AUTH screen (Login, OTP, the OAuth
        // callback) is a real login transition and enters the app, clearing the auth screens.
        // Unauthenticated still always returns to Login (sign-out, a cleared session), unchanged.
        when (sessionRedirectFor(sessionState, onAuthScreen = navController.currentDestination.isAuthScreen())) {
            // A real login — the same point the web gates onboarding at its auth callback. A
            // brand-new user is routed to the wizard first; everyone else to the shell.
            // needsOnboarding() fails open (false) so a check failure never blocks entry.
            SessionRedirect.EnterApp -> {
                // A pending deep link (e.g. a shared group link tapped while logged out) owns
                // navigation for this transition — the deepLinkTarget effect above navigates
                // straight to it and consumes it. This generic redirect must not also fire: its
                // popUpTo(inclusive = true) would clear the deep-linked destination right back out
                // of the stack the instant it lands, silently discarding the deep link.
                if (deepLinkTarget != null) return@LaunchedEffect
                val destination = if (viewModel.needsOnboarding()) AppRoute.Onboarding else AppRoute.HomeShell
                navController.navigate(destination) {
                    popUpTo(navController.graph.id) { inclusive = true }
                }
            }
            // An anonymous session is a usable session, not a logged-out one: straight to the
            // app, and deliberately NOT through needsOnboarding(). An anonymous identity has no
            // `profiles` row by design (20260808c_handle_new_user_skip_anonymous.sql), so
            // /api/profile reports onboarded = false forever and the gate would trap the user in
            // the wizard. Signing in with Google/Zalo creates the profile and restores the normal
            // onboarding decision.
            SessionRedirect.EnterShell -> {
                if (deepLinkTarget != null) return@LaunchedEffect
                navController.navigate(AppRoute.HomeShell) {
                    popUpTo(navController.graph.id) { inclusive = true }
                }
            }
            SessionRedirect.Login -> navController.navigate(AuthRoute.Login) {
                popUpTo(navController.graph.id) { inclusive = true }
            }
            null -> Unit
        }
    }

    // The spinner is the COLD-START gate only: before the first resolution there is nothing to
    // show. A later `Loading` (the SDK's foreground re-announcement above passes through it) must
    // not take the NavHost out of composition — that would drop every nested screen's state (the
    // shell's tab, Explore's own back stack, the pager's page) even without any navigation.
    if (sessionState == AuthSessionState.Loading && !hasResolvedSession) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            TappyLoadingIndicator()
        }
        return
    }

    // Fixed at the first resolution: NavHost rebuilds its graph — and resets the back stack —
    // whenever `startDestination` changes, so it must not follow later session transitions
    // (those navigate explicitly above). Anonymous starts in the app for the same reason it is
    // routed there above — it is a real session. Only Unauthenticated starts on Login.
    val startDestination = remember {
        if (sessionState == AuthSessionState.Authenticated || sessionState == AuthSessionState.Anonymous) {
            AppRoute.HomeShell
        } else {
            AuthRoute.Login
        }
    }

    NavHost(
        navController = navController,
        startDestination = startDestination,
    ) {
        composable<AuthRoute.Login> { LoginScreen() }
        composable<AuthRoute.EmailOtpVerification> {
            EmailOtpVerificationScreen(onBackClick = { navController.popBackStack() })
        }
        composable<AuthRoute.AuthCallback> {
            // Transient "completing sign-in" screen — sessionState flipping to Authenticated
            // (observed above) is what actually navigates away from here, not this composable.
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                TappyLoadingIndicator()
            }
        }
        composable<AppRoute.HomeShell> {
            // The only user-initiated route to Login. Deliberately NO popUpTo: the anonymous
            // session is still live and its conversation is not claimed yet, so the shell must
            // stay on the back stack — backing out of Login has to return the guest to their
            // app exactly as they left it. The automatic auth transitions above still clear the
            // stack, so a completed sign-in lands correctly and Login does not linger.
            HomeShellScreen(
                onSignIn = { navController.navigate(AuthRoute.Login) },
                // The Home header hosts the app's light/dark toggle; both values come straight
                // from MainActivity, so the header reflects and drives the one global theme.
                isDarkTheme = isDarkTheme,
                onToggleDarkTheme = onToggleDarkTheme,
            )
        }
        // Post-login onboarding wizard; on finish it replaces itself with the shell so Back can't
        // return to it (mirrors the web's router.replace to the destination).
        composable<AppRoute.Onboarding> {
            OnboardingScreen(
                onFinished = {
                    navController.navigate(AppRoute.HomeShell) {
                        popUpTo(navController.graph.id) { inclusive = true }
                    }
                },
            )
        }
        composable<AppRoute.DesignSystemShowcase> {
            DesignSystemShowcaseScreen(isDarkTheme = isDarkTheme, onToggleDarkTheme = onToggleDarkTheme)
        }
        // Full-screen group page over the shell — reached in-app after creating a group, or via a
        // `tappyai://group/{id}` deep link (see AppNavHostViewModel.handleDeepLink). The
        // GroupDetailViewModel reads its groupId from this typed route via SavedStateHandle.
        composable<AppRoute.GroupDetail> {
            GroupDetailScreen(onBack = { navController.popBackStack() })
        }
        // Same host, reached from a past booking's Review button — ReviewComposerViewModel reads
        // placeId/placeName from this entry's SavedStateHandle.
        composable<AppRoute.ComposerForPlace> {
            ReviewComposerHost(onBack = { navController.popBackStack() })
        }
    }
}

/** What the root host does when the session state changes after the first resolution. */
internal enum class SessionRedirect { EnterApp, EnterShell, Login }

/**
 * The root host's redirect for a session transition, from the new [state] and WHERE the user
 * is: [onAuthScreen] is true on Login, OTP verification and the OAuth callback. A session that
 * resolves there is a login → [SessionRedirect.EnterApp] (onboarding gate) for a signed-in
 * user, [SessionRedirect.EnterShell] for an anonymous one. The same states arriving while the
 * user is already inside the app (the foreground re-announcement, a token refresh) redirect
 * nowhere: the current back stack is the right place to be. [AuthSessionState.Unauthenticated]
 * always goes to [SessionRedirect.Login]; [AuthSessionState.Loading] never redirects.
 */
internal fun sessionRedirectFor(state: AuthSessionState, onAuthScreen: Boolean): SessionRedirect? = when (state) {
    AuthSessionState.Authenticated -> if (onAuthScreen) SessionRedirect.EnterApp else null
    AuthSessionState.Anonymous -> if (onAuthScreen) SessionRedirect.EnterShell else null
    AuthSessionState.Unauthenticated -> SessionRedirect.Login
    AuthSessionState.Loading -> null
}

/** True when [this] is one of the auth graph's screens — the only places a session resolution is a login. */
private fun NavDestination?.isAuthScreen(): Boolean =
    this != null && (hasRoute<AuthRoute.Login>() || hasRoute<AuthRoute.EmailOtpVerification>() || hasRoute<AuthRoute.AuthCallback>())
