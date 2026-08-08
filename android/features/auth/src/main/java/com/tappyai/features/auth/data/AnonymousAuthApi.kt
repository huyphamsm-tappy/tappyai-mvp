package com.tappyai.features.auth.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * `POST /api/auth/anonymous` — mints a server-authoritative anonymous session.
 *
 * The response shape is a STABLE cross-client contract, locked by iOS's
 * `AnonymousSessionDecodeTests` and documented in `src/app/api/auth/anonymous/route.ts`:
 * how the backend mints these tokens is deliberately opaque to clients. Today it is Supabase
 * Anonymous Auth, so the tokens flow through the same Bearer pipeline as a signed-in user.
 *
 * `anonymous_id` is informational for the client. Every rule that matters — the 5/day quota,
 * conversation ownership, the anon→account claim — is derived server-side from the VERIFIED
 * token, never from an id the client sends.
 *
 * Deliberately NOT authenticated: this is how a client with no session gets one. `AuthInterceptor`
 * simply attaches nothing when `TokenProvider` is empty.
 */
interface AnonymousAuthApi {

    /** Empty JSON body — the endpoint takes no parameters, but expects a POST with a body
     *  (iOS sends `{}` too, and some proxies reject a bodyless POST). */
    @POST("api/auth/anonymous")
    suspend fun createAnonymousSession(@Body body: Map<String, String> = emptyMap()): AnonymousSessionDto

    /**
     * `POST /api/auth/claim-anonymous` — hands the anonymous session's conversations to the
     * account the user just signed into.
     *
     * The caller must already be authenticated: `AuthInterceptor` attaches the NEW account's
     * Bearer, and the OLD anonymous access token travels in the body as proof of possession.
     * No user ids are sent — the server resolves both identities from the two tokens it
     * verifies, which is what stops one account claiming another anonymous user's history.
     */
    @POST("api/auth/claim-anonymous")
    suspend fun claimAnonymous(@Body body: ClaimAnonymousRequestDto): ClaimAnonymousResponseDto
}

/** The stable contract. `expires_at` is epoch SECONDS (Supabase's native unit). */
@Serializable
data class AnonymousSessionDto(
    @SerialName("access_token") val accessToken: String = "",
    @SerialName("refresh_token") val refreshToken: String = "",
    @SerialName("anonymous_id") val anonymousId: String = "",
    @SerialName("expires_at") val expiresAt: Long = 0L,
)

@Serializable
data class ClaimAnonymousRequestDto(
    @SerialName("anonymous_access_token") val anonymousAccessToken: String,
)

/** `moved` is how many conversations changed owner; 0 is a valid, successful repeat claim. */
@Serializable
data class ClaimAnonymousResponseDto(
    val ok: Boolean = false,
    val moved: Int = 0,
)
