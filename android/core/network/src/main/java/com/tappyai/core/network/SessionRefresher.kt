package com.tappyai.core.network

import com.tappyai.core.security.TokenProvider

/**
 * Abstraction over refreshing the current auth session, used by [TokenAuthenticator] on a 401.
 * Defined here (not in `features:auth`, where the real implementation lives) so `core:network`
 * can depend on the capability without depending on the auth feature module — `features:auth`
 * already depends on `core:network`, so the reverse would be a module cycle. The concrete
 * `@Binds` lives in `features:auth`'s own Hilt module.
 */
interface SessionRefresher {
    /** Attempts to refresh the current session (updating whatever [TokenProvider] the concrete
     *  auth layer uses) and returns whether it succeeded — a new access token is available via
     *  [TokenProvider.getAccessToken] immediately after a `true` result. */
    suspend fun refreshSession(): Boolean
}
