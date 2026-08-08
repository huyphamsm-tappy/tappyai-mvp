package com.tappyai.core.security

/** The subset of standard JWT claims (RFC 7519 §4.1) this app actually reads. All timestamps
 *  are epoch seconds, matching the JWT spec's own `NumericDate` format. */
data class JwtClaims(
    val subject: String?,
    val issuedAt: Long?,
    val expiresAt: Long?,
    /**
     * Supabase's non-standard `is_anonymous` claim: true for a session minted by Anonymous
     * Sign-ins. Defaults to false, so a token that predates the claim — or any token whose
     * payload cannot be read — is treated as a normal account, never accidentally downgraded
     * to anonymous.
     *
     * This is a UX signal only, exactly like the rest of this class: the app uses it to pick a
     * session state and a start destination. Every rule that actually matters (the 5/day quota,
     * conversation ownership, the anon→account claim) is decided server-side from the VERIFIED
     * token — see supabase/migrations/20260711_anon_chat_usage.sql and
     * src/app/api/auth/claim-anonymous/route.ts.
     */
    val isAnonymous: Boolean = false,
)
