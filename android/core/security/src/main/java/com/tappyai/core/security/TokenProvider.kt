package com.tappyai.core.security

/**
 * The single seam for reading/writing the Supabase auth session's access and refresh tokens.
 * `core:network`'s `AuthInterceptor` depends on this to attach `Authorization: Bearer <token>`
 * to outgoing requests — see [isAccessTokenExpired] for the local, claims-only expiry check
 * that lets the interceptor avoid sending a token it already knows is stale.
 *
 * Authentication itself (sign-in flow, token exchange, refresh-on-401) is Phase 1B — this
 * interface only stores and reads whatever tokens that flow will eventually produce.
 */
interface TokenProvider {
    fun getAccessToken(): String?
    fun getRefreshToken(): String?
    fun saveTokens(accessToken: String, refreshToken: String?)
    fun clearTokens()

    /** True if there's no access token, it's malformed, or its `exp` claim has passed.
     *  Claims-only — see [JwtDecoder] for why this never verifies the token's signature. */
    fun isAccessTokenExpired(): Boolean
}
