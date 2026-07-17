package com.tappyai.features.auth.navigation

import com.tappyai.core.navigation.TappyRoute
import kotlinx.serialization.Serializable

/**
 * `features:auth`'s own route types, implementing `core:navigation`'s [TappyRoute] marker —
 * the first concrete routes built against that Phase 0.5 contract. Each leaf is `@Serializable`
 * for Navigation Compose's type-safe `composable<T>()`/`navigate(route)` API (2.8+); the sealed
 * interface itself doesn't need the annotation since routes are registered individually, not
 * serialized polymorphically as "AuthRoute."
 */
sealed interface AuthRoute : TappyRoute {
    @Serializable
    data object Login : AuthRoute

    @Serializable
    data class EmailOtpVerification(val email: String) : AuthRoute

    /** Destination for the OAuth redirect deep link (`tappyai://auth-callback?...`) —
     *  see [com.tappyai.features.auth.deeplink.AuthDeepLinkParser]. */
    @Serializable
    data class AuthCallback(val code: String? = null, val error: String? = null) : AuthRoute
}
