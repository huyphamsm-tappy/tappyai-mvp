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
    LaunchedEffect(sessionState) {
        if (!hasHandledInitialState) {
            hasHandledInitialState = true
            return@LaunchedEffect
        }
        // `popUpTo(0)` is a leftover idiom from the old resource-id-based navigation API and
        // doesn't apply here — `graph.id` is the correct, type-safe-API way to clear the
        // entire back stack down to (and including) the graph root when switching between
        // the auth graph and the post-auth destination.
        when (sessionState) {
            // This branch fires only on a real login transition (cold-start restore is skipped by
            // hasHandledInitialState above) — the same point the web gates onboarding at its auth
            // callback. A brand-new user is routed to the wizard first; everyone else to the shell.
            // needsOnboarding() fails open (false) so a check failure never blocks entry.
            AuthSessionState.Authenticated -> {
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
            AuthSessionState.Unauthenticated -> navController.navigate(AuthRoute.Login) {
                popUpTo(navController.graph.id) { inclusive = true }
            }
            AuthSessionState.Loading -> Unit
        }
    }

    if (sessionState == AuthSessionState.Loading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            TappyLoadingIndicator()
        }
        return
    }

    NavHost(
        navController = navController,
        startDestination = if (sessionState == AuthSessionState.Authenticated) {
            AppRoute.HomeShell
        } else {
            AuthRoute.Login
        },
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
            HomeShellScreen()
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
        // ReviewComposerViewModel reads trackId/trackTitle from this entry's SavedStateHandle
        // (same convention as ChatViewModel's conversationId) — no need to thread them through
        // this composable's params. See AppRoute.ComposerWithSound's doc for why this is a
        // top-level route rather than living inside the Reviews tab's own nested NavHost.
        composable<AppRoute.ComposerWithSound> {
            ReviewComposerHost(onBack = { navController.popBackStack() })
        }
        // Same host, reached from a past booking's Review button — ReviewComposerViewModel reads
        // placeId/placeName from this entry's SavedStateHandle.
        composable<AppRoute.ComposerForPlace> {
            ReviewComposerHost(onBack = { navController.popBackStack() })
        }
    }
}
