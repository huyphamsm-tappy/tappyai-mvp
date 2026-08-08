package com.tappyai.app.auth

import com.tappyai.core.security.JwtDecoder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Anonymous Chat — the JWT claim that separates an anonymous session from a real account.
 *
 * To supabase-kt both are `SessionStatus.Authenticated`; `is_anonymous` is the ONLY
 * discriminator, so `AuthRepository.sessionState`'s branch is exactly as trustworthy as this
 * mapping. Both directions are asserted, plus every shape a stored token can actually take.
 *
 * These call [JwtDecoder.parseClaims] rather than `decode`, because `decode` first runs
 * `android.util.Base64`, which is an empty android.jar stub under unit tests (the project has
 * no Robolectric). The Base64 step is unchanged and already shipping; the claim mapping is the
 * half that carries meaning, and it is what these tests pin down.
 */
class AnonymousSessionStateTest {

    @Test
    fun `an anonymous session token maps to isAnonymous = true`() {
        val claims = JwtDecoder.parseClaims(
            """{"sub":"abc","exp":9999999999,"is_anonymous":true,"role":"authenticated"}""")
        assertEquals("abc", claims?.subject)
        assertEquals(9999999999L, claims?.expiresAt)
        assertTrue(claims!!.isAnonymous)
    }

    @Test
    fun `a real account token maps to isAnonymous = false`() {
        val claims = JwtDecoder.parseClaims(
            """{"sub":"abc","exp":9999999999,"is_anonymous":false,"role":"authenticated"}""")
        assertFalse(claims!!.isAnonymous)
    }

    @Test
    fun `a token predating the claim is treated as a real account, never anonymous`() {
        // Every token issued before Anonymous Sign-ins existed omits the claim. Defaulting those
        // to anonymous would drop already-signed-in users into the 5/day quota on upgrade.
        val claims = JwtDecoder.parseClaims("""{"sub":"abc","exp":9999999999}""")
        assertFalse(claims!!.isAnonymous)
    }

    @Test
    fun `a string "true" is accepted, and that leniency is the safe direction`() {
        // kotlinx's booleanOrNull runs toBooleanStrictOrNull() on the primitive's content, so a
        // JSON string "true" decodes to true. Documented rather than "fixed": the token is
        // server-signed, and for THIS claim leniency fails the safe way. Rejecting a
        // string-shaped claim would classify an anonymous session as a real account, which
        // routes the user into an onboarding wizard they can never complete (no profiles row).
        // The reverse mistake costs nothing — the server re-derives every rule from the
        // verified token regardless of what the client believes.
        assertTrue(JwtDecoder.parseClaims("""{"sub":"a","is_anonymous":"true"}""")!!.isAnonymous)
    }

    @Test
    fun `a non-boolean, non-parsable is_anonymous stays false`() {
        assertFalse(JwtDecoder.parseClaims("""{"sub":"a","is_anonymous":"yes"}""")!!.isAnonymous)
        assertFalse(JwtDecoder.parseClaims("""{"sub":"a","is_anonymous":1}""")!!.isAnonymous)
    }

    @Test
    fun `a malformed payload maps to null rather than throwing`() {
        assertNull(JwtDecoder.parseClaims("not json"))
        assertNull(JwtDecoder.parseClaims(""))
        assertNull(JwtDecoder.parseClaims("[1,2,3]")) // valid JSON, wrong shape
    }

    @Test
    fun `the default on the data class itself is not anonymous`() {
        // The mapping above is the only place isAnonymous is ever set to true.
        assertFalse(com.tappyai.core.security.JwtClaims(null, null, null).isAnonymous)
    }
}
