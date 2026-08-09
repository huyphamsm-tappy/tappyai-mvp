package com.tappyai.app.auth

import com.tappyai.features.auth.data.AnonymousSessionDto
import com.tappyai.features.auth.data.ClaimAnonymousRequestDto
import com.tappyai.features.auth.data.ClaimAnonymousResponseDto
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the two anonymous-auth wire shapes against the backend routes
 * (`src/app/api/auth/anonymous/route.ts`, `src/app/api/auth/claim-anonymous/route.ts`) and against
 * iOS, which decodes the same payloads. A silent rename on either side would surface only at
 * runtime, and only as "the guest session never arrives" / "my chats vanished after signing in" —
 * the two failures this feature exists to prevent.
 *
 * The Json here mirrors `NetworkModule.provideJson()` (ignoreUnknownKeys + isLenient), so what
 * these tests accept is what Retrofit actually accepts.
 */
class AnonymousAuthWireTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `anonymous session response decodes the snake_case contract`() {
        val body = """
            {
              "access_token": "eyJhbGciOiJIUzI1NiJ9.payload.sig",
              "refresh_token": "v1-refresh-token",
              "anonymous_id": "8f14e45f-ceea-467a-9f4c-1b2c3d4e5f60",
              "expires_at": 1786291200
            }
        """.trimIndent()

        val dto = json.decodeFromString<AnonymousSessionDto>(body)

        assertEquals("eyJhbGciOiJIUzI1NiJ9.payload.sig", dto.accessToken)
        assertEquals("v1-refresh-token", dto.refreshToken)
        assertEquals("8f14e45f-ceea-467a-9f4c-1b2c3d4e5f60", dto.anonymousId)
        // Epoch SECONDS, not millis — AuthRepository subtracts System.currentTimeMillis()/1000
        // from this to build UserSession.expiresIn. A millis value here would compute an
        // expiry ~56,000 years out and defeat every refresh.
        assertEquals(1786291200L, dto.expiresAt)
    }

    /** The route may grow fields (it already returns more than iOS reads); an addition must not
     *  break existing clients, which is the whole reason the shared Json ignores unknown keys. */
    @Test
    fun `an added server field does not break decoding`() {
        val dto = json.decodeFromString<AnonymousSessionDto>(
            """{"access_token":"a","refresh_token":"r","anonymous_id":"i","expires_at":1,"issued_by":"supabase"}"""
        )
        assertEquals("a", dto.accessToken)
    }

    /**
     * A response missing the tokens must decode to blanks rather than throw, because
     * `ensureAnonymousSession()` is required to fail OPEN — it checks for blank tokens and
     * returns. If this threw instead, the app would still survive (the catch is there), but the
     * blank-check is the intended path and this pins it as reachable.
     */
    @Test
    fun `a tokenless response decodes to blanks instead of throwing`() {
        val dto = json.decodeFromString<AnonymousSessionDto>("""{"anonymous_id":"i"}""")
        assertEquals("", dto.accessToken)
        assertEquals("", dto.refreshToken)
    }

    /**
     * THE security property of the claim call: the client sends the anonymous token and NOTHING
     * else. Both identities are derived server-side from verified tokens, so no user id ever
     * travels from the device — that is what stops a signed-in account claiming someone else's
     * anonymous conversations by guessing an id.
     */
    @Test
    fun `claim request carries the anonymous token and no identifiers`() {
        val body = ClaimAnonymousRequestDto(anonymousAccessToken = "anon-jwt")

        assertEquals("""{"anonymous_access_token":"anon-jwt"}""", json.encodeToString(body))

        val keys = json.parseToJsonElement(json.encodeToString(body)).jsonObject.keys
        assertEquals(setOf("anonymous_access_token"), keys)
        assertTrue(
            "no id/user field may ever be added to this body — the server must derive both " +
                "identities from tokens it verifies itself",
            keys.none { it.contains("id") || it.contains("user") },
        )
    }

    @Test
    fun `claim response decodes ok and moved`() {
        val dto = json.decodeFromString<ClaimAnonymousResponseDto>("""{"ok":true,"moved":3}""")
        assertTrue(dto.ok)
        assertEquals(3, dto.moved)
    }

    /** A repeat claim (already transferred, or an anonymous session that never chatted) moves
     *  zero rows and is still a success — the client must not treat 0 as a failure. */
    @Test
    fun `moved zero is still a successful claim`() {
        val dto = json.decodeFromString<ClaimAnonymousResponseDto>("""{"ok":true,"moved":0}""")
        assertTrue(dto.ok)
        assertEquals(0, dto.moved)
    }
}
