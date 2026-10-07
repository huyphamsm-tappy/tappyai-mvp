package com.tappyai.features.auth.data

/**
 * How a session became Authenticated. Only an explicit, user-initiated sign-in is a
 * login / sign_up. A restored session (importSession on cold start), a silent token
 * refresh, and an anonymous mint all reach `SessionStatus.Authenticated` too — they must
 * emit NOTHING, or every app launch would look like a login and wreck the funnel.
 */
enum class AuthTrigger { EXPLICIT_SIGN_IN, SESSION_RESTORE, TOKEN_REFRESH, ANONYMOUS_MINT }

/** A GA4 auth event to emit through the analytics seam. */
data class AuthAnalyticsEvent(val name: String, val params: Map<String, Any>)

/**
 * THE auth-analytics rule as a PURE function, so "a restored session does not emit login" is
 * unit-testable without a live Supabase client. Emits nothing unless the trigger is an explicit
 * sign-in; then always a `login` (carrying is_first_login), plus a `sign_up` when this is the
 * account's first ever sign-in — matching web, where both fire on a first sign-in.
 */
fun authAnalyticsEventsFor(trigger: AuthTrigger, method: String, isFirstLogin: Boolean): List<AuthAnalyticsEvent> {
    if (trigger != AuthTrigger.EXPLICIT_SIGN_IN) return emptyList()
    val events = mutableListOf<AuthAnalyticsEvent>()
    if (isFirstLogin) events += AuthAnalyticsEvent("sign_up", mapOf("method" to method))
    events += AuthAnalyticsEvent("login", mapOf("method" to method, "is_first_login" to isFirstLogin))
    return events
}

/**
 * First sign-in ≈ the account was created at the same moment it last signed in. Both timestamps
 * (epoch seconds) must be present; a returning login has last_sign_in_at well after created_at.
 * A small window absorbs clock skew between account creation and the session's first stamp.
 */
fun isFirstLoginFromTimestamps(createdAtEpochSec: Long?, lastSignInEpochSec: Long?): Boolean {
    if (createdAtEpochSec == null || lastSignInEpochSec == null) return false
    return kotlin.math.abs(lastSignInEpochSec - createdAtEpochSec) <= FIRST_LOGIN_WINDOW_SEC
}

private const val FIRST_LOGIN_WINDOW_SEC = 5L
