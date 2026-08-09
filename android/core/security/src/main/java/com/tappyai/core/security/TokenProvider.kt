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

    /** Clears the session tokens. Does NOT clear the pending anonymous claim — that has to
     *  outlive a sign-out/sign-in transition; see [savePendingAnonymousClaim]. */
    fun clearTokens()

    /**
     * Remembers an anonymous session's access token so it can be handed to
     * `POST /api/auth/claim-anonymous` after the user signs in with Google/Zalo, which is what
     * carries their anonymous conversations into the new account.
     *
     * It lives here, in the same encrypted store as the session tokens, because it IS session
     * material: it is a bearer credential for the anonymous identity, and the claim endpoint
     * treats possession of it as proof of ownership. It must survive the auth transition (and a
     * process death mid-transition), so it is deliberately not cleared by [clearTokens].
     */
    fun savePendingAnonymousClaim(accessToken: String)

    fun getPendingAnonymousClaim(): String?

    /** Call only once the claim has been resolved — succeeded, or failed in a way that retrying
     *  cannot fix. Clearing it early silently strands the user's anonymous history. */
    fun clearPendingAnonymousClaim()

    /** True if there's no access token, it's malformed, or its `exp` claim has passed.
     *  Claims-only — see [JwtDecoder] for why this never verifies the token's signature. */
    fun isAccessTokenExpired(): Boolean
}
