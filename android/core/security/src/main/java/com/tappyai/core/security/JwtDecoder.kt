package com.tappyai.core.security

import android.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * Decodes a JWT's payload segment to read [JwtClaims] — **never verifies the token's
 * signature.** Signature verification requires the issuer's key (Supabase's), which a client
 * must never hold; the backend is the only party that can or should verify a token's
 * authenticity. This decoder exists purely for local UX decisions (e.g. "does this stored
 * token look expired, should the app proactively re-authenticate") — it must never be treated
 * as a security control, and nothing here should be used to decide whether to trust a token's
 * *contents*, only to read it for scheduling.
 */
object JwtDecoder {
    private val json = Json { ignoreUnknownKeys = true }

    /** Returns `null` for any malformed input rather than throwing — a corrupted or
     *  unexpectedly-shaped stored token is a real possible state, not a programming error. */
    fun decode(token: String): JwtClaims? {
        val segments = token.split(".")
        if (segments.size < 2) return null

        return try {
            val payload = String(segments[1].decodeBase64Url(), Charsets.UTF_8)
            val claims = json.parseToJsonElement(payload).jsonObject
            JwtClaims(
                subject = claims["sub"]?.jsonPrimitive?.contentOrNull,
                issuedAt = claims["iat"]?.jsonPrimitive?.longOrNull,
                expiresAt = claims["exp"]?.jsonPrimitive?.longOrNull,
            )
        } catch (e: Exception) {
            null
        }
    }

    /** JWT segments are base64url-encoded *without* padding (RFC 7515 Appendix C), but
     *  `android.util.Base64` requires correctly padded input — pad to a multiple of 4 first. */
    private fun String.decodeBase64Url(): ByteArray {
        val padded = this.padEnd((length + 3) / 4 * 4, '=')
        return Base64.decode(padded, Base64.URL_SAFE or Base64.NO_WRAP)
    }
}
