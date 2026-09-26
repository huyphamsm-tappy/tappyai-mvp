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
 * Zalo is **not** a Supabase provider, so the ENTIRE OAuth + session-mint flow lives on the
 * backend, exactly as on the web:
 * `/api/auth/zalo?platform=android` → Zalo permission → `/api/auth/zalo/callback`, which now does
 * everything server-side (code→token→identity via the Vietnam verifier→admin create-or-reuse
 * user→magic link) → `/auth/confirm?platform=android` →
 * `tappyai://auth-callback#access_token&refresh_token&expires_at`.
 *
 * 🚨 THE ZALO ACCESS TOKEN NEVER REACHES THIS APP, and never reaches the Custom Tab either. It
 * used to: `graph.zalo.me/v2.0/me` answers only Vietnamese IP addresses, so the backend handed the
 * token to the browser (in a URL fragment) and let the device's own Vietnamese connection fetch
 * the profile. Measured 2026-09-26, that fragment stayed in the browser's history. The backend
 * reaches Zalo through its own verifier in Vietnam now (`infra/zalo-verify/`), so that page and
 * the completion endpoint it called are deleted. What arrives on `tappyai://auth-callback` is a
 * SUPABASE session, the same as for Google and Facebook — never anything belonging to Zalo.
 *
 * Android's ONLY job is to open [loginUrl] in a Chrome Custom Tab and let it run. The deep link is
 * turned into a session by the existing machinery ([AuthRepository.handleOAuthRedirectIntent] →
 * `supabaseClient.handleDeeplinks`), the same completion path Google/Facebook OAuth already use.
 * **No OAuth logic, secret, or session-mint runs on-device.**
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
    /**
     * The one URL this app opens for Zalo sign-in. Same base-URL concatenation the network layer
     * uses (e.g. RealChatRepository's "${baseUrl}api/chat"); baseUrl ends in '/'. `returnTo=/`
     * mirrors the web default.
     */
    fun loginUrl(): String = "${baseUrl}api/auth/zalo?platform=android&returnTo=/"

    /** [context] must be an Activity context — a Custom Tab launches an activity. Success here only
     *  means the Custom Tab opened; the session completes later via the deep-link callback. */
    fun launch(context: Context) {
        CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(loginUrl()))
    }
}
