package com.tappyai.core.network

import com.tappyai.core.security.TokenProvider
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Named

/**
 * On a 401 from our own API, refreshes the session (via [SessionRefresher], implemented by
 * `features:auth`'s `AuthRepository`) and retries once with the new token — closes the gap
 * [AuthInterceptor] itself never could: a stored access token going stale mid-session (Supabase's
 * own background refresh is suspended while the app is backgrounded, per the SDK's lifecycle
 * hooks) previously meant the *next* authenticated request just failed with a raw 401 even though
 * the user was still genuinely signed in and a refresh would have succeeded moments later.
 *
 * Host-scoped identically to [AuthInterceptor] and for the same reason (documented on that
 * class): this OkHttpClient is a process-wide singleton, so an unscoped authenticator would
 * attempt to attach/refresh our own Bearer token in response to a 401 from an unrelated
 * third-party host a future feature might call through the same client.
 */
class TokenAuthenticator @Inject constructor(
    private val tokenProvider: TokenProvider,
    private val sessionRefresher: SessionRefresher,
    @Named("baseUrl") baseUrl: String,
) : Authenticator {

    private val apiHost = baseUrl.toHttpUrlOrNull()?.host

    override fun authenticate(route: Route?, response: Response): Request? {
        if (apiHost == null || response.request.url.host != apiHost) return null
        // Already retried once for this call chain — give up rather than loop forever against a
        // refresh token that keeps failing (e.g. revoked, or the user is genuinely signed out).
        if (responseCount(response) >= 2) return null

        val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")
        val currentToken = tokenProvider.getAccessToken()
        // Another request already refreshed the token concurrently (OkHttp serializes calls to
        // the same Authenticator, but multiple in-flight requests can each land here in turn) —
        // just retry with what's already fresh instead of refreshing again.
        if (currentToken != null && currentToken != failedToken) {
            return response.request.newBuilder()
                .header("Authorization", "Bearer $currentToken")
                .build()
        }

        // Authenticator.authenticate runs on OkHttp's own dispatcher thread (never the caller's),
        // and blocking here is the documented, intended pattern for a synchronous refresh-and-
        // retry — see OkHttp's own Authenticator docs.
        val refreshed = runBlocking {
            try {
                sessionRefresher.refreshSession()
            } catch (e: Exception) {
                false
            }
        }
        if (!refreshed) return null

        val newToken = tokenProvider.getAccessToken() ?: return null
        return response.request.newBuilder()
            .header("Authorization", "Bearer $newToken")
            .build()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
