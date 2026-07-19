package com.tappyai.features.auth.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.SessionRefresher
import com.tappyai.core.security.JwtDecoder
import com.tappyai.core.security.TokenProvider
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.OtpType
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.handleDeeplinks
import io.github.jan.supabase.auth.providers.Facebook
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.providers.builtin.OTP
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Wraps every Supabase auth call `features:auth` needs, and is the *only* place that reads a
 * Supabase session and writes it into `core:security`'s [TokenProvider] — `core:security`
 * itself doesn't change; this is the one connection point the plan called for.
 *
 * Import paths and API shapes below were corrected during the Phase 1B.1 Build Verification
 * pass against real sources (Supabase's official docs and the `supabase-community/supabase-kt`
 * GitHub repo, fetched during that pass — not re-derived from memory). Package paths
 * (`io.github.jan.supabase.auth.*`, `providers.builtin.IDToken`/`OTP`) were confirmed against
 * the actual repository file tree.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val tokenProvider: TokenProvider,
    private val logger: LoggerProvider,
    private val zaloSignInClient: ZaloSignInClient,
) : SessionRefresher {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // Guards session restoration so it runs at most once per process, even when
    // WhileSubscribed(5_000) restarts the cold sessionState flow after a long background pause.
    private val sessionRestored = AtomicBoolean(false)

    /**
     * The `AuthGate` (M6) observes this to decide the NavHost's start destination — and,
     * critically, to wait for [AuthSessionState.Loading] to resolve before picking one, rather
     * than defaulting to Login and flashing it for a frame on cold start.
     *
     * **Fixed during Phase 1B.1's real build (supabase-kt 3.0.3, after reverting from 3.5.0
     * for Kotlin-version compatibility — see libs.versions.toml):** decompiled the actual
     * `auth-kt-debug-3.0.3.aar` and confirmed `SessionStatus` has exactly 4 variants in this
     * version — `Authenticated`, `Initializing`, `NotAuthenticated`, `RefreshFailure`. No
     * `LoadingFromStorage` (that was added in a later release); re-add it here if the project
     * ever moves back to a supabase-kt version that has it.
     *
     * Session persistence: supabase-kt 3.0.3 defaults to in-memory session storage, so the SDK
     * loses its session across process restarts. On first collection after a restart, this flow
     * calls [importSession] with the tokens from [EncryptedTokenStorage] before forwarding SDK
     * state — this blocks any emission until restoration is attempted, preventing a spurious
     * Unauthenticated→Login flash when the user was previously signed in.
     */
    val sessionState: Flow<AuthSessionState> = flow {
        if (!sessionRestored.getAndSet(true)) {
            val accessToken = tokenProvider.getAccessToken()
            val refreshToken = tokenProvider.getRefreshToken()
            if (accessToken != null && refreshToken != null) {
                runCatching {
                    val expiresAt = JwtDecoder.decode(accessToken)?.expiresAt ?: 0L
                    val nowSec = System.currentTimeMillis() / 1000
                    supabaseClient.auth.importSession(
                        UserSession(
                            accessToken = accessToken,
                            refreshToken = refreshToken,
                            expiresIn = (expiresAt - nowSec).coerceAtLeast(0L),
                            tokenType = "bearer",
                        )
                    )
                }.onFailure { e ->
                    if (e is CancellationException) throw e
                    logger.w(TAG, "Session restoration failed: ${e.message}")
                    tokenProvider.clearTokens()
                }
            }
        }
        // sessionStatus is a StateFlow — replays the current value immediately, so there is no
        // gap between importSession completing and the first AuthSessionState emission.
        emitAll(
            supabaseClient.auth.sessionStatus.map { status ->
                when (status) {
                    is SessionStatus.Authenticated -> AuthSessionState.Authenticated
                    is SessionStatus.Initializing -> AuthSessionState.Loading
                    is SessionStatus.NotAuthenticated -> AuthSessionState.Unauthenticated
                    is SessionStatus.RefreshFailure -> AuthSessionState.Unauthenticated
                }
            }
        )
    }

    init {
        // Keep EncryptedTokenStorage in sync when the Supabase SDK silently refreshes the
        // access token in the background. Without this, only explicit sign-in calls would
        // update the stored tokens; a background SDK refresh would leave EncryptedTokenStorage
        // holding the old (expired) access token, breaking the next process restart's restore.
        scope.launch {
            supabaseClient.auth.sessionStatus.collect { status ->
                if (status is SessionStatus.Authenticated) persistSession()
            }
        }
    }

    /** [idToken] comes from Credential Manager's native Google Sign-In (UI-layer concern, not
     *  this repository's — see `GoogleSignInClient` in the same package). */
    suspend fun signInWithGoogleIdToken(idToken: String, rawNonce: String?): NetworkResult<Unit> =
        safeAuthCall {
            supabaseClient.auth.signInWith(IDToken) {
                this.idToken = idToken
                provider = Google
                nonce = rawNonce
            }
            persistSession()
        }.logOnError("signInWithGoogleIdToken")

    /**
     * Launches the browser/Custom-Tab OAuth flow — does **not** itself return a completed
     * session. Facebook has no native-credential shortcut the way Google does via Credential
     * Manager, so this always goes through the redirect flow; completion arrives later via the
     * `tappyai://auth-callback` deep link (M7), which calls [handleOAuthRedirectIntent].
     */
    suspend fun startFacebookSignIn(): NetworkResult<Unit> = safeAuthCall {
        supabaseClient.auth.signInWith(Facebook)
    }.logOnError("startFacebookSignIn")

    /**
     * Zalo sign-in — thin delegate to [ZaloSignInClient], which opens the backend web OAuth flow
     * in a Chrome Custom Tab. Kept on the repository so the LoginScreen → LoginViewModel →
     * AuthRepository pipeline matches the other providers; no OAuth/session logic lives here (the
     * launch is a Custom-Tab/[context] UI concern). Completion arrives later via the
     * `tappyai://auth-callback` deep link → [handleOAuthRedirectIntent], like every other OAuth.
     */
    fun startZaloSignIn(context: Context) = zaloSignInClient.launch(context)

    suspend fun sendEmailOtp(email: String): NetworkResult<Unit> = safeAuthCall {
        // No redirectUrl: passing one makes Supabase send a magic-LINK email (no code), but this
        // flow navigates to the OTP code-entry screen and calls verifyEmailOtp(token = code).
        // Omitting it makes Supabase send the 6-digit OTP code instead — matching the web's
        // signInWithOtp({ email }) (no emailRedirectTo) + verifyOtp({ token, type: 'email' }).
        supabaseClient.auth.signInWith(OTP) {
            this.email = email
        }
    }.logOnError("sendEmailOtp")

    suspend fun verifyEmailOtp(email: String, code: String): NetworkResult<Unit> = safeAuthCall {
        supabaseClient.auth.verifyEmailOtp(type = OtpType.Email.EMAIL, email = email, token = code)
        persistSession()
    }.logOnError("verifyEmailOtp")

    /**
     * Called from `MainActivity.onNewIntent`/`onCreate` (M8) when the OAuth redirect deep
     * link arrives. Two shapes reach here, matching iOS `AuthRepository.signInWithZalo`
     * (fragment-first, PKCE-fallback):
     *
     *  1. **Token fragment** — the backend's custom Zalo flow hands the session straight back as
     *     `tappyai://auth-callback#access_token=…&refresh_token=…&expires_at=…` (see
     *     `/auth/confirm`). supabase-kt's [handleDeeplinks] only consumes a PKCE `?code=`, so it
     *     can't import this; [parseOAuthFragment] reads the tokens and [importSession] loads them
     *     directly (same construction as the cold-start restore in [sessionState]).
     *  2. **PKCE `?code=`** — Supabase-native OAuth (e.g. Facebook) redirects with a code in the
     *     query; there is no token fragment, so we fall back to [handleDeeplinks], which performs
     *     the code exchange on the [SupabaseClient] itself (not the `Auth` plugin instance).
     *
     * Either way [persistSession] then syncs the resulting session into [TokenProvider], same as
     * every other successful sign-in path.
     */
    suspend fun handleOAuthRedirectIntent(intent: Intent): NetworkResult<Unit> = safeAuthCall {
        val fragmentSession = parseOAuthFragment(intent)
        if (fragmentSession != null) {
            val expiresAt = JwtDecoder.decode(fragmentSession.accessToken)?.expiresAt ?: 0L
            val nowSec = System.currentTimeMillis() / 1000
            supabaseClient.auth.importSession(
                UserSession(
                    accessToken = fragmentSession.accessToken,
                    refreshToken = fragmentSession.refreshToken,
                    expiresIn = (expiresAt - nowSec).coerceAtLeast(0L),
                    tokenType = "bearer",
                )
            )
        } else {
            supabaseClient.handleDeeplinks(intent)
        }
        persistSession()
    }.logOnError("handleOAuthRedirectIntent")

    /**
     * Extracts session tokens from a native OAuth callback's URL **fragment**
     * (`tappyai://auth-callback#access_token=…&refresh_token=…`). Returns null when there is no
     * token fragment — e.g. a PKCE `?code=` redirect — so the caller falls back to
     * [handleDeeplinks]. Mirrors iOS's fragment parse in `AuthRepository.signInWithZalo`.
     *
     * Reads `encodedFragment` (still percent-encoded) and re-parses it as a query string so the
     * SDK's own URL decoder recovers the exact token values, rather than hand-splitting.
     */
    private fun parseOAuthFragment(intent: Intent): OAuthFragmentSession? {
        val fragment = intent.data?.encodedFragment?.takeIf { it.isNotEmpty() } ?: return null
        val params = Uri.parse("tappyai://oauth?$fragment")
        val accessToken = params.getQueryParameter("access_token")?.takeIf { it.isNotEmpty() } ?: return null
        val refreshToken = params.getQueryParameter("refresh_token")?.takeIf { it.isNotEmpty() } ?: return null
        return OAuthFragmentSession(accessToken, refreshToken)
    }

    private data class OAuthFragmentSession(val accessToken: String, val refreshToken: String)

    suspend fun signOut(): NetworkResult<Unit> = safeAuthCall {
        supabaseClient.auth.signOut()
        tokenProvider.clearTokens()
    }.logOnError("signOut")

    /**
     * [SessionRefresher] implementation, called by [com.tappyai.core.network.TokenAuthenticator]
     * on a 401 from our own API. `refreshCurrentSession()` reads the SDK's own stored refresh
     * token and exchanges it for a new session (throws `IllegalStateException` if there's no
     * refresh token at all, e.g. genuinely signed out — caught below, same as any other failure).
     * [persistSession] on success keeps [TokenProvider] in sync, exactly like every other
     * session-changing call in this class.
     */
    override suspend fun refreshSession(): Boolean = try {
        supabaseClient.auth.refreshCurrentSession()
        persistSession()
        true
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        logger.w(TAG, "refreshSession failed: ${e.message}")
        false
    }

    /**
     * The signed-in user's id, read from the current access token's `sub` claim — the native
     * analog of the web's `supabase.auth.getUser()` used to decide creator-only affordances (e.g.
     * Group Dining's creator-vs-member view). Reads the token the [com.tappyai.core.network.AuthInterceptor]
     * actually sends, so the id matches what the backend attributes the request to, and it survives
     * cold-start session restore (where the SDK's in-memory session has no user object but the
     * stored token still encodes `sub`). Returns null when signed out. This only drives UI — the
     * backend independently enforces ownership server-side (e.g. suggest is 403 for non-creators).
     */
    fun currentUserId(): String? =
        tokenProvider.getAccessToken()?.let { JwtDecoder.decode(it)?.subject }

    private fun <T> NetworkResult<T>.logOnError(operation: String): NetworkResult<T> = also {
        if (it is NetworkResult.Error) {
            logger.e(TAG, "$operation failed", (it.error as? NetworkError.Unknown)?.throwable)
        }
    }

    private fun persistSession() {
        val session = supabaseClient.auth.currentSessionOrNull()
        if (session != null) {
            tokenProvider.saveTokens(session.accessToken, session.refreshToken)
        } else {
            logger.w(TAG, "persistSession() called with no active Supabase session")
        }
    }

    private companion object {
        const val TAG = "AuthRepository"
    }
}
