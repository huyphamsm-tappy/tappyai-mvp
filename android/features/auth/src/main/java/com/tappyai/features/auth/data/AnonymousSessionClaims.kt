package com.tappyai.features.auth.data

import com.tappyai.core.security.JwtDecoder

/**
 * Whether an access token belongs to a Supabase Anonymous Sign-ins session.
 *
 * Kept as a free function rather than a private method on [AuthRepository] so the branch that
 * decides Anonymous-vs-Authenticated can be unit-tested on the JVM without constructing the
 * Supabase client. [AuthRepository.sessionState] is the only production caller.
 *
 * Fails toward "not anonymous": a malformed token, a missing claim, or anything the decoder
 * cannot read yields false. Mistaking a real account for anonymous would strand a paying-tier
 * user in the 5/day anonymous quota, whereas the opposite mistake is caught immediately by the
 * server, which re-derives everything from the verified token.
 */
internal fun isAnonymousSession(accessToken: String?): Boolean {
    if (accessToken.isNullOrBlank()) return false
    return JwtDecoder.decode(accessToken)?.isAnonymous == true
}
