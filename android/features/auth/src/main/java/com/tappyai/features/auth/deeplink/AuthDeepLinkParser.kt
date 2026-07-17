package com.tappyai.features.auth.deeplink

import android.net.Uri
import com.tappyai.core.deeplink.DeepLinkParser
import com.tappyai.core.navigation.TappyRoute
import com.tappyai.features.auth.navigation.AuthRoute
import javax.inject.Inject

/**
 * First concrete [DeepLinkParser] implementation (`core:deeplink`'s contract was previously
 * interface-only). Parses the OAuth redirect (`tappyai://auth-callback?code=...` or
 * `?error=...`) into [AuthRoute.AuthCallback] — the query-param shape matches Supabase's PKCE
 * flow (an authorization `code`), not a URL-fragment/implicit-flow token, since that's what
 * supabase-kt's Android integration is documented to use by default.
 */
class AuthDeepLinkParser @Inject constructor() : DeepLinkParser {
    override fun parse(uri: String): TappyRoute? {
        val parsed = Uri.parse(uri)
        if (parsed.scheme != SCHEME || parsed.host != HOST) return null

        return AuthRoute.AuthCallback(
            code = parsed.getQueryParameter("code"),
            error = parsed.getQueryParameter("error"),
        )
    }

    private companion object {
        const val SCHEME = "tappyai"
        const val HOST = "auth-callback"
    }
}
