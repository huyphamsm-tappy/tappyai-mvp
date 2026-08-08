package com.tappyai.features.auth.data

/**
 * `features:auth`'s own session-state vocabulary, mapped from supabase-kt's `SessionStatus` —
 * kept separate rather than re-exporting the SDK type directly so `:app`'s `AuthGate` (M6)
 * doesn't depend on a third-party type across the module boundary (same reasoning as
 * `core:network`'s `NetworkResult` wrapping Retrofit-specific exceptions, not exposing them
 * raw). [Loading] is distinct from [Unauthenticated] specifically so `AuthGate` doesn't flash
 * the Login screen for a frame while the session is still being read from disk on cold start.
 */
sealed interface AuthSessionState {
    data object Loading : AuthSessionState
    data object Authenticated : AuthSessionState

    /**
     * A Supabase Anonymous Sign-ins session: a real `auth.users` identity with a real JWT, so it
     * flows through the same Bearer pipeline as a signed-in user — the SDK reports it as
     * `SessionStatus.Authenticated` and only the token's `is_anonymous` claim tells the two apart.
     *
     * It is NOT "logged out": the app is fully usable, chat works against the server-enforced
     * anonymous quota, and conversations persist. It must never be routed to Login, and never
     * through onboarding (an anonymous identity has no `profiles` row by design, so the
     * onboarding gate would otherwise see `onboarded = false` forever).
     */
    data object Anonymous : AuthSessionState

    data object Unauthenticated : AuthSessionState
}
