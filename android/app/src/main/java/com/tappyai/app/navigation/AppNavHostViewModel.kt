package com.tappyai.app.navigation

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.BuildConfig
import com.tappyai.app.R
import com.tappyai.core.common.StringProvider
import com.tappyai.core.deeplink.DeepLinkParser
import com.tappyai.core.navigation.TappyRoute
import com.tappyai.core.network.NetworkResult
import com.tappyai.app.onboarding.data.OnboardingRepository
import com.tappyai.features.auth.data.AuthRepository
import com.tappyai.features.auth.data.AuthSessionState
import com.tappyai.features.auth.navigation.AuthRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Thin wrapper exposing [TappyNavigatorImpl] (a plain Hilt singleton, not itself a ViewModel)
 * and [AuthRepository]'s session state to [AppNavHost] — same pattern as Phase 1A's
 * `DiagnosticsViewModel` wrapping cross-cutting singletons for a Composable.
 *
 * Activity-scoped (Hilt's default `by viewModels()`/`hiltViewModel()` resolution against the
 * Activity's `ViewModelStoreOwner`) so `MainActivity.onNewIntent` (M8) and the `AppNavHost`
 * Composable it hosts share the exact same instance — [handleDeepLink] is called from the
 * former, [sessionState] observed from the latter.
 */
@HiltViewModel
class AppNavHostViewModel @Inject constructor(
    val navigator: TappyNavigatorImpl,
    private val authRepository: AuthRepository,
    private val onboardingRepository: OnboardingRepository,
    private val groupDeepLinkParser: GroupDeepLinkParser,
    private val webLinkDeepLinkParser: WebLinkDeepLinkParser,
    private val pendingShellDestination: PendingShellDestination,
    private val authDeepLinkParser: DeepLinkParser,
    private val stringProvider: StringProvider,
) : ViewModel() {
    val sessionState: StateFlow<AuthSessionState> = authRepository.sessionState
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AuthSessionState.Loading)

    /**
     * Whether a just-logged-in user should see onboarding first. Delegates to the repository
     * (`GET api/profile`'s `onboarded` flag), which fails open — returns false, i.e. skip
     * onboarding, if the check can't complete — so a network hiccup never traps a returning user
     * behind the wizard. Called only on the login transition, matching where the web gates.
     */
    suspend fun needsOnboarding(): Boolean = onboardingRepository.needsOnboarding()

    /**
     * A deep-link navigation target waiting to be consumed. A [StateFlow] (not the transient
     * navigator bus) so it survives the cold-start case — a link tapped while the app is not
     * running is handled in `MainActivity.onCreate` *before* `AppNavHost` subscribes, and the bus's
     * replay=0 would drop it. Being a retained value, it is also naturally held until the user is
     * authenticated: [AppNavHost] only acts on it once `sessionState` is Authenticated, then calls
     * [consumeDeepLink].
     */
    private val _deepLinkTarget = MutableStateFlow<TappyRoute?>(null)
    val deepLinkTarget: StateFlow<TappyRoute?> = _deepLinkTarget.asStateFlow()

    fun consumeDeepLink() {
        _deepLinkTarget.value = null
    }

    /**
     * One-shot user-facing messages — currently only a failed OAuth callback exchange (a
     * malformed/expired/already-used `code`, e.g. a double-tapped magic link). Before this
     * existed, that failure was caught, logged, and silently discarded: the user was left sitting
     * on [com.tappyai.features.auth.navigation.AuthRoute.AuthCallback]'s loading spinner or back on
     * Login with zero indication anything happened.
     */
    private val _authError = Channel<String>(Channel.BUFFERED)
    val authError: Flow<String> = _authError.receiveAsFlow()

    /**
     * Routes an incoming `tappyai://…` deep link by host: the OAuth redirect
     * (`tappyai://auth-callback`) navigates to [AuthRoute.AuthCallback] (its "completing sign-in"
     * spinner — see [AppNavHost]) *before* starting the exchange, then completes sign-in through
     * [AuthRepository]; a shared group link (`tappyai://group/{id}`) resolves to
     * [AppRoute.GroupDetail] and is published on [deepLinkTarget] for [AppNavHost] to navigate to.
     * Unrecognized links are ignored.
     */
    fun handleDeepLink(intent: Intent) {
        val uri = intent.data ?: return
        if (uri.host == "auth-callback") {
            viewModelScope.launch {
                (authDeepLinkParser.parse(uri.toString()) as? AuthRoute.AuthCallback)?.let {
                    navigator.navigateTo(it)
                }
                val result = authRepository.handleOAuthRedirectIntent(intent)
                if (result is NetworkResult.Error) {
                    _authError.send(stringProvider.get(R.string.chat_toast_signin_failed))
                }
            }
        } else {
            // P4-14. The chain, not a single parser: a notification carries the WEB entity URL
            // (`emitNotification` puts `entityUrl` in `data.url`), while a shared link uses the
            // custom `tappyai://` scheme. Both are external entry points and both should resolve
            // through the same list — which is exactly what `TappyNotificationRouting` already
            // does on its side. Before this, an https notification link matched nothing and a tap
            // simply opened the app wherever it was.
            //
            // Order is not significant: the two parsers accept disjoint schemes. A parser that
            // throws on a malformed link is contained, because a bad link in a payload the app did
            // not write must not become a crash on tap.
            val link = uri.toString()
            val appRoute = listOf(groupDeepLinkParser, webLinkDeepLinkParser)
                .firstNotNullOfOrNull { parser -> runCatching { parser.parse(link) }.getOrNull() }

            if (appRoute != null) {
                _deepLinkTarget.value = appRoute
            } else {
                // No app-wide route matched. The link may still name a destination INSIDE the
                // post-auth shell, whose vocabulary is deliberately private to it. Navigate to the
                // shell — a route that already exists — and hand the nested destination across for
                // the shell to consume itself, rather than promoting its tabs into the global
                // vocabulary for the sake of one entry point.
                ShellDeepLink.destinationFor(link, BuildConfig.WEB_APP_URL)?.let { shellRoute ->
                    pendingShellDestination.set(shellRoute)
                    _deepLinkTarget.value = AppRoute.HomeShell
                }
            }
        }
    }
}
