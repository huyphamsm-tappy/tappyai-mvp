package com.tappyai.core.network

import com.tappyai.core.security.TokenProvider
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Named

/**
 * Attaches `Authorization: Bearer <token>` to every outgoing request when [TokenProvider] has
 * one, mirroring the backend's own `getRequestUser()` Bearer pattern
 * (`src/lib/auth/getRequestUser.ts`). Requests proceed unauthenticated when there's no token —
 * this interceptor doesn't gate access, individual endpoints do that server-side.
 *
 * Only attaches the token to requests targeting our own API host ([apiHost], derived from the
 * same `@Named("baseUrl")` the shared [okhttp3.OkHttpClient]/Retrofit are built from). Gate
 * review finding: this client is a process-wide singleton — if any future feature ever reuses
 * it for a third-party call (a payment SDK, a maps API, ...), an unscoped interceptor would
 * leak the user's Supabase JWT to that third party. Host-scoping costs nothing today (there is
 * only one host) and closes that door before it can be forgotten later.
 *
 * Does not refresh an expired token itself — attaches whatever [TokenProvider] currently has, even
 * if stale. [TokenAuthenticator] (registered alongside this interceptor in [NetworkModule]) is
 * what refreshes and retries on a 401; splitting the two matches OkHttp's own division of labor
 * (`Interceptor` decorates the outgoing request, `Authenticator` reacts to an auth failure).
 */
class AuthInterceptor @Inject constructor(
    private val tokenProvider: TokenProvider,
    @Named("baseUrl") baseUrl: String,
) : Interceptor {

    private val apiHost = baseUrl.toHttpUrlOrNull()?.host

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = tokenProvider.getAccessToken()
        val isOwnApiHost = apiHost != null && original.url.host == apiHost

        val request = if (token != null && isOwnApiHost) {
            original.newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else {
            original
        }

        return chain.proceed(request)
    }
}
