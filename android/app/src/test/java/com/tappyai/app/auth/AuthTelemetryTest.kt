package com.tappyai.app.auth

import com.tappyai.features.auth.data.AuthTrigger
import com.tappyai.features.auth.data.authAnalyticsEventsFor
import com.tappyai.features.auth.data.isFirstLoginFromTimestamps
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The auth-analytics rule (features/auth `AuthTelemetry`). A login/sign_up is emitted ONLY for an
 * explicit user sign-in; a restored session, a token refresh and an anonymous mint reach
 * Authenticated too and must emit nothing. Pure, so it proves the "restore does not emit login"
 * guarantee without a live Supabase client (the module has no Robolectric — see
 * AnonymousSessionLifecycleTest).
 */
class AuthTelemetryTest {

    @Test
    fun `a restored session emits no login`() {
        assertEquals(emptyList<Any>(), authAnalyticsEventsFor(AuthTrigger.SESSION_RESTORE, "google", isFirstLogin = false))
        assertEquals(emptyList<Any>(), authAnalyticsEventsFor(AuthTrigger.SESSION_RESTORE, "email", isFirstLogin = true))
    }

    @Test
    fun `a silent token refresh and an anonymous mint emit nothing`() {
        assertTrue(authAnalyticsEventsFor(AuthTrigger.TOKEN_REFRESH, "google", isFirstLogin = false).isEmpty())
        assertTrue(authAnalyticsEventsFor(AuthTrigger.ANONYMOUS_MINT, "anonymous", isFirstLogin = false).isEmpty())
        assertTrue(authAnalyticsEventsFor(AuthTrigger.TOKEN_REFRESH, "email", isFirstLogin = true).isEmpty())
    }

    @Test
    fun `an explicit returning sign-in emits exactly one login with is_first_login false`() {
        val events = authAnalyticsEventsFor(AuthTrigger.EXPLICIT_SIGN_IN, "google", isFirstLogin = false)
        assertEquals(1, events.size)
        assertEquals("login", events[0].name)
        assertEquals(mapOf("method" to "google", "is_first_login" to false), events[0].params)
    }

    @Test
    fun `an explicit first sign-in emits sign_up then login, both carrying the method`() {
        val events = authAnalyticsEventsFor(AuthTrigger.EXPLICIT_SIGN_IN, "email", isFirstLogin = true)
        assertEquals(listOf("sign_up", "login"), events.map { it.name })
        assertEquals(mapOf("method" to "email"), events.first { it.name == "sign_up" }.params)
        assertEquals(mapOf("method" to "email", "is_first_login" to true), events.first { it.name == "login" }.params)
        // sign_up must not carry is_first_login (GA sign_up takes method only).
        assertFalse(events.first { it.name == "sign_up" }.params.containsKey("is_first_login"))
    }

    @Test
    fun `is_first_login is true only when created-at and last-sign-in coincide`() {
        assertTrue("created == last sign-in → first", isFirstLoginFromTimestamps(1_700_000_000L, 1_700_000_000L))
        assertTrue("within the skew window", isFirstLoginFromTimestamps(1_700_000_000L, 1_700_000_004L))
        assertFalse("a returning login, days later", isFirstLoginFromTimestamps(1_700_000_000L, 1_700_200_000L))
        assertFalse("missing created-at", isFirstLoginFromTimestamps(null, 1_700_000_000L))
        assertFalse("missing last-sign-in", isFirstLoginFromTimestamps(1_700_000_000L, null))
    }
}
