package com.tappyai.app.navigation

import android.net.Uri
import com.tappyai.core.deeplink.DeepLinkParser
import com.tappyai.core.navigation.TappyRoute
import javax.inject.Inject

/**
 * Parses a shared group link into [AppRoute.GroupDetail]. Handles the custom scheme
 * `tappyai://group/{id}` (no domain verification needed — the same reason the OAuth callback filter
 * uses a custom scheme). The public **web** link (`https://<origin>/group/{id}`) is what actually
 * gets shared so recipients on any platform can open it; making that https link open the app
 * natively additionally requires App Links domain verification (owner-side assetlinks.json), which
 * is intentionally out of scope here — this custom-scheme path gives a working native entry now.
 */
class GroupDeepLinkParser @Inject constructor() : DeepLinkParser {
    override fun parse(uri: String): TappyRoute? {
        val parsed = Uri.parse(uri)
        if (parsed.scheme != SCHEME || parsed.host != HOST) return null
        val id = parsed.pathSegments.firstOrNull()?.takeIf { it.isNotBlank() } ?: return null
        return AppRoute.GroupDetail(id)
    }

    private companion object {
        const val SCHEME = "tappyai"
        const val HOST = "group"
    }
}
