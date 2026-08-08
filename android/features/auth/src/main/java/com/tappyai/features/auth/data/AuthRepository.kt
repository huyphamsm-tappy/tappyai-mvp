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
import dagger.Lazy
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
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import retrofit2.HttpException
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
    // dagger.Lazy, not a direct injection: AuthRepository is bound as core:network's
    // SessionRefresher, which TokenAuthenticator needs to build OkHttp, which Retrofit needs to
    // build AnonymousAuthApi — a genuine Dagger dependency cycle. Deferring resolution to first
    // use breaks it, and costs nothing: by the time any anonymous call runs, the graph is built.
    private val anonymousAuthApi: Lazy<AnonymousAuthApi>,
) : SessionRefresher {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // Guards session restoration so it runs at most once per process, even when
    // WhileSubscribed(5_000) restarts the cold sessionState flow after a long background pause.
    private val sessionRestored = AtomicBoolean(false)

    /** Single-flight guard for [ensureAnonymousSession]: every call to the endpoint mints a NEW
     *  auth.users row, so concurrent callers would create duplicate throwaway identities. */
    private val anonymousMintInFlight = AtomicBoolean(false)

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
            // First run, or a launch with nothing restorable: get an anonymous session before
            // the first emission, so the nav host resolves straight to the shell instead of
            // flashing Login and then jumping. A no-op when a session was restored just above,
            // and a no-op (fail-open) if the endpoint is unavailable — in which case this flow
            // emits Unauthenticated and the app behaves exactly as it does today.
            ensureAnonymousSession()
        }
        // sessionStatus is a StateFlow — replays the current value immediately, so there is no
        // gap between importSession completing and the first AuthSessionState emission.
        emitAll(
            supabaseClient.auth.sessionStatus.map { status ->
                when (status) {
                    // An anonymous session is `Authenticated` as far as the SDK is concerned —
                    // it is a real auth.users row with a real JWT. The token's `is_anonymous`
                    // claim is the only thing that separates the two, so read it here rather
                    // than inventing a parallel session concept.
                    is SessionStatus.Authenticated ->
                        if (isAnonymousSession(status.session.accessToken)) {
                            AuthSessionState.Anonymous
                        } else {
                            AuthSessionState.Authenticated
                        }
                    is SessionStatus.Initializing -> AuthSessionState.Loading
                    is SessionStatus.NotAuthenticated -> AuthSessionState.Unauthenticated
                    is SessionStatus.RefreshFailure -> AuthSessionState.Unauthenticated
                }
            }
        )
        // Round-2 audit fix: without this, the Keystore-backed token reads and importSession(...)
        // above run on whatever dispatcher the collector uses — AppNavHostViewModel collects via
        // viewModelScope.stateIn(...), whose default dispatcher is Main.immediate — blocking the
        // main thread on every cold start for a previously-signed-in user, visibly janking the
        // splash-to-loading-spinner transition.
    }.flowOn(Dispatchers.IO)

    init {
        // Keep EncryptedTokenStorage in sync when the Supabase SDK silently refreshes the
        // access token in the background. Without this, only explicit sign-in calls would
        // update the stored tokens; a background SDK refresh would leave EncryptedTokenStorage
        // holding the old (expired) access token, breaking the next process restart's restore.
        scope.launch {
            supabaseClient.auth.sessionStatus.collect { status ->
                if (status !is SessionStatus.Authenticated) return@collect
                persistSession()

                // The anon→account carry-over is wired HERE rather than at each sign-in call
                // site, because the sign-in paths do not share one: Google returns a session
                // inline, Facebook and Zalo complete later via a deep link, and OTP via
                // verifyOtp. Every one of them ends at this collector, so a provider added
                // later inherits the behaviour instead of silently losing users' history.
                if (isAnonymousSession(status.session.accessToken)) {
                    // Snapshot while it is still the live session — once sign-in replaces it,
                    // this token (and with it, the only handle on those conversations) is gone.
                    tokenProvider.savePendingAnonymousClaim(status.session.accessToken)
                } else {
                    // Now signed in for real: hand over anything the anonymous session left.
                    // No-op when there is nothing pending, so this is cheap on token refreshes.
                    claimPendingAnonymousConversations()
                }
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
        // redirectUrl at the signInWith level makes Supabase embed tappyai://auth-callback as
        // the redirect target in the magic-link email, so tapping "Sign in" opens the app.
        supabaseClient.auth.signInWith(OTP, redirectUrl = "tappyai://auth-callback") {
            this.email = email
            // Web parity (login/page.tsx:188-191 `shouldCreateUser: true`): create the account for a
            // first-time email. supabase-kt's OTP `createUser` defaults to FALSE (the inverse of
            // supabase-js), which would silently fail email signup for a never-seen address.
            this.createUser = true
        }
    }.logOnError("sendEmailOtp")

    suspend fun verifyEmailOtp(email: String, code: String): NetworkResult<Unit> = safeAuthCall {
        supabaseClient.auth.verifyEmailOtp(type = OtpType.Email.EMAIL, email = email, token = code)
        persistSession()
    }.logOnError("verifyEmailOtp")

    /**
     * Called from `MainActivity.onNewIntent`/`onCreate` (M8) when the OAuth redirect deep
     * link arrives. Two shapes reach here (fragment-first, PKCE-fallback):
     *
     *  1. **Token fragment** — the backend's custom Zalo flow hands the session straight back as
     *     `tappyai://auth-callback#access_token=…&refresh_token=…&expires_at=…` (see
     *     `/auth/confirm` for `platform=android`). supabase-kt's [handleDeeplinks] only consumes a
     *     PKCE `?code=`, so it can't import this; [parseOAuthFragment] reads the tokens and
     *     [importSession] loads them directly (same construction as the cold-start restore in
     *     [sessionState]).
     *  2. **PKCE `?code=`** — Supabase-native OAuth (Google/Facebook) redirects with a code in the
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
     * [handleDeeplinks]. Reads `encodedFragment` (still percent-encoded) and re-parses it as a
     * query string so the URL decoder recovers the exact token values, rather than hand-splitting.
     */
    private fun parseOAuthFragment(intent: Intent): OAuthFragmentSession? {
        val fragment = intent.data?.encodedFragment?.takeIf { it.isNotEmpty() } ?: return null
        val params = Uri.parse("tappyai://oauth?$fragment")
        val accessToken = params.getQueryParameter("access_token")?.takeIf { it.isNotEmpty() } ?: return null
        val refreshToken = params.getQueryParameter("refresh_token")?.takeIf { it.isNotEmpty() } ?: return null
        return OAuthFragmentSession(accessToken, refreshToken)
    }

    private data class OAuthFragmentSession(val accessToken: String, val refreshToken: String)

    /**
     * Signing out returns the user to an ANONYMOUS session, not a tokenless/Login state —
     * matching iOS (`signOut()` → `ensureAnonymousSession()`). The app stays usable and chat
     * keeps working against the anonymous 5/day quota.
     *
     * Order matters: `auth.signOut()` invalidates the old session server-side and
     * `clearTokens()` removes it locally, so the new anonymous session can never be minted
     * while the previous authenticated token is still present or reused. `clearTokens()`
     * deliberately leaves any pending anonymous claim intact.
     */
    suspend fun signOut(): NetworkResult<Unit> = safeAuthCall {
        supabaseClient.auth.signOut()
        tokenProvider.clearTokens()
        ensureAnonymousSession()
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

    /**
     * True when the stored session belongs to an anonymous user.
     *
     * Needed because [currentUserId] is non-null for an anonymous session too — it is a real
     * `auth.users` row — so callers that used `currentUserId() != null` as shorthand for
     * "has an account" must pair it with this. Synchronous and claims-only, like
     * [currentUserId]; see [JwtDecoder] for why nothing here verifies a signature.
     */
    fun isAnonymous(): Boolean = isAnonymousSession(tokenProvider.getAccessToken())

    /**
     * Reads the signed-in user's `gender` from Supabase auth metadata — the same place the web reads
     * it (`user_metadata.gender`, `profile/preferences/page.tsx`). Best-effort: null when no user is
     * loaded yet (populated after the first save, since [updateGender] refreshes the local user).
     */
    fun currentGender(): String? =
        supabaseClient.auth.currentUserOrNull()?.userMetadata?.get("gender")?.jsonPrimitive?.contentOrNull

    /**
     * Persists `gender` to Supabase auth metadata via `auth.updateUser({ data: { gender } })` — the
     * exact web save path (`profile/preferences/page.tsx:111`). The `/api/preferences` endpoint has
     * no gender field, so this is the only place it can live; without it the selection was lost.
     */
    suspend fun updateGender(gender: String): Result<Unit> = runCatching {
        supabaseClient.auth.updateUser { data { put("gender", gender) } }
    }

    private fun <T> NetworkResult<T>.logOnError(operation: String): NetworkResult<T> = also {
        if (it is NetworkResult.Error) {
            logger.e(TAG, "$operation failed", (it.error as? NetworkError.Unknown)?.throwable)
        }
    }

    /**
     * Obtains an anonymous session when there is no usable one, mirroring iOS's
     * `AuthRepository.ensureAnonymousSession()` (survey §0 · D1).
     *
     * FAIL OPEN, exactly like iOS: if the endpoint is unavailable — which is its current
     * production state, `503 anonymous_unavailable` until Anonymous Sign-ins is enabled — this
     * logs and returns. It never throws, never retries in a loop, and never fabricates a
     * session. The app stays on whatever state it already had.
     *
     * NO DUPLICATE IDENTITIES. Every call to the endpoint mints a new `auth.users` row, so two
     * concurrent callers would create two throwaway accounts and strand the first one's
     * conversations. [anonymousMintInFlight] makes minting single-flight, and the
     * `currentSessionOrNull()` check makes it a no-op whenever any session already exists —
     * including one another coroutine just imported.
     */
    suspend fun ensureAnonymousSession() {
        if (supabaseClient.auth.currentSessionOrNull() != null) return
        if (!anonymousMintInFlight.compareAndSet(false, true)) return
        try {
            // Re-check inside the guard: a session may have landed while we were queuing.
            if (supabaseClient.auth.currentSessionOrNull() != null) return

            val dto = anonymousAuthApi.get().createAnonymousSession()
            if (dto.accessToken.isBlank() || dto.refreshToken.isBlank()) {
                logger.w(TAG, "anonymous session response missing tokens")
                return
            }

            // Import into the SDK rather than keeping a second bearer of our own: this is what
            // makes AuthInterceptor, TokenAuthenticator's refresh-on-401 and sessionState all
            // work for an anonymous user with no special-casing anywhere.
            val nowSec = System.currentTimeMillis() / 1000
            supabaseClient.auth.importSession(
                UserSession(
                    accessToken = dto.accessToken,
                    refreshToken = dto.refreshToken,
                    expiresIn = (dto.expiresAt - nowSec).coerceAtLeast(0L),
                    tokenType = "bearer",
                )
            )
            persistSession()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Backend capability not live yet, offline, 5xx — all the same to the client.
            logger.i(TAG, "anonymous session unavailable, continuing without one")
        } finally {
            anonymousMintInFlight.set(false)
        }
    }

    /**
     * Hands any pending anonymous session's conversations to the account that is now signed in.
     *
     * Sends ONLY the anonymous access token; the server derives both identities from tokens it
     * verifies, so no user id is ever sent from here (that is what stops one account claiming
     * another's history). The backend owns the transfer — nothing is merged, deduplicated or
     * deleted client-side.
     *
     * The pending token is cleared on success, and on a definitive rejection where retrying
     * cannot help (the server already moved the rows, or the token is not a claimable anonymous
     * session). It is deliberately KEPT on a transport failure so a later attempt can still
     * rescue the history — losing it is the one outcome that permanently orphans a user's
     * conversations.
     */
    suspend fun claimPendingAnonymousConversations(): Boolean {
        val pending = tokenProvider.getPendingAnonymousClaim() ?: return false
        return try {
            val result = anonymousAuthApi.get().claimAnonymous(ClaimAnonymousRequestDto(pending))
            tokenProvider.clearPendingAnonymousClaim()
            result.ok
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpException) {
            // 4xx = the server has ruled on this token and will rule the same way next time
            // (invalid/expired/not-anonymous/self-claim). Keeping it would retry forever.
            // 5xx / anything else keeps it for a future attempt.
            if (e.code() in 400..499) tokenProvider.clearPendingAnonymousClaim()
            logger.w(TAG, "anonymous claim rejected (${e.code()})")
            false
        } catch (e: Exception) {
            logger.w(TAG, "anonymous claim failed, keeping pending token for retry")
            false
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
