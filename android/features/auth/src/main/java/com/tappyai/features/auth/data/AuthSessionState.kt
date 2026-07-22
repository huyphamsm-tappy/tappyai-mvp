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
    data object Unauthenticated : AuthSessionState
}
