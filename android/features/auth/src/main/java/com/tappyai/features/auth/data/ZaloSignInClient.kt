package com.tappyai.features.auth.data

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/**
 * Zalo Login launcher — the on-device half of the web's Zalo flow (web is source of truth).
 *
 * Zalo is **not** a Supabase provider and its profile API (`graph.zalo.me/me`) is Vietnam-IP-gated,
 * so the ENTIRE OAuth + session-mint flow lives on the backend, exactly as on the web:
 * `/api/auth/zalo?platform=android` → Zalo permission → `/api/auth/zalo/callback` (code→token) →
 * `/auth/zalo-finish` (runs client-side on the device's Vietnamese IP to fetch the profile) →
 * `/api/auth/zalo/complete` (admin create-or-reuse user + magic link) → `/auth/confirm?platform=android`
 * → redirect to `tappyai://auth-callback#access_token&refresh_token&expires_at`.
 *
 * Android's ONLY job is to open that web flow in a Chrome Custom Tab and let it run. The backend
 * finishes by redirecting to the app's `tappyai://auth-callback` deep link, which the existing
 * machinery ([AuthRepository.handleOAuthRedirectIntent] → `supabaseClient.handleDeeplinks`) turns
 * into a session — the same completion path Google/Facebook OAuth already use. **No OAuth logic,
 * secret, or session-mint runs on-device.**
 *
 * Mirrors [GoogleSignInClient]'s shape: a UI-layer client taking an Activity [Context] per call
 * (a Custom Tab must launch from one), rather than [AuthRepository] (which is deliberately
 * context-free). `platform=android` selects the backend branch that redirects to Android's own
 * `tappyai://auth-callback` scheme (see the web `/auth/confirm` route).
 */
@Singleton
class ZaloSignInClient @Inject constructor(
    @Named("baseUrl") private val baseUrl: String,
) {
    /** [context] must be an Activity context — a Custom Tab launches an activity. Success here only
     *  means the Custom Tab opened; the session completes later via the deep-link callback. */
    fun launch(context: Context) {
        // Same base-URL concatenation the network layer uses (e.g. RealChatRepository's
        // "${baseUrl}api/chat"); baseUrl ends in '/'. returnTo=/ mirrors the web default.
        val url = "${baseUrl}api/auth/zalo?platform=android&returnTo=/"
        CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(url))
    }
}
