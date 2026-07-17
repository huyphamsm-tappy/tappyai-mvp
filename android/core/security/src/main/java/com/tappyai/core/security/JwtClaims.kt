package com.tappyai.core.security

/** The subset of standard JWT claims (RFC 7519 §4.1) this app actually reads. All timestamps
 *  are epoch seconds, matching the JWT spec's own `NumericDate` format. */
data class JwtClaims(
    val subject: String?,
    val issuedAt: Long?,
    val expiresAt: Long?,
)
