package com.tappyai.features.auth.data

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsClient
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
    /** The `uat` build's Vercel Deployment Protection bypass; the empty string in every other build. */
    @Named("vercelBypassSecret") private val deploymentBypassSecret: String,
) {
    /**
     * The one URL this app opens for Zalo sign-in. Same base-URL concatenation the network layer
     * uses (e.g. RealChatRepository's "${baseUrl}api/chat"); baseUrl ends in '/'. `returnTo=/`
     * mirrors the web default. `app_state` is this sign-in's login-CSRF state
     * ([AuthCallbackStateGuard]); the backend echoes it back as `state` in the callback (R24).
     */
    fun loginUrl(appState: String): String =
        "${baseUrl}api/auth/zalo?platform=android&returnTo=/&app_state=${java.net.URLEncoder.encode(appState, "UTF-8")}"

    /**
     * What the Custom Tab is actually pointed at: [loginUrl], plus — only in the `uat` build, where
     * [deploymentBypassSecret] is non-empty — the two parameters Vercel Deployment Protection needs
     * to let a cookie-less browser through (`x-vercel-protection-bypass`, and
     * `x-vercel-set-bypass-cookie` so the redirect back from Zalo is let through too). A release
     * build has an empty secret and opens exactly [loginUrl].
     */
    fun launchUrl(appState: String): String {
        val base = loginUrl(appState)
        if (deploymentBypassSecret.isEmpty()) return base
        return "$base&x-vercel-protection-bypass=${java.net.URLEncoder.encode(deploymentBypassSecret, "UTF-8")}&x-vercel-set-bypass-cookie=true"
    }

    /**
     * [context] must be an Activity context — a Custom Tab launches an activity. Success here only
     * means the Custom Tab opened; the session completes later via the deep-link callback.
     *
     * 🚨 EPHEMERAL, ON PURPOSE — account switching. The tab used to share Chrome's cookie jar, so
     * Zalo found the Zalo web session already signed in (as the PREVIOUS person), approved the
     * permission page without showing anything, and redirected back in about a second. After a
     * logout the next "Tiếp tục với Zalo" therefore returned the same identity every time, and a
     * second account was unreachable — measured on a real device 2026-10-06: `/api/auth/zalo` and
     * `/api/auth/zalo/callback` answered in the same second, the Zalo app was never launched, and
     * the backend's account list held exactly one Zalo user. Zalo's authorize endpoint has no
     * documented re-authentication / account-picker parameter, so the browser context is what has
     * to be fresh: an ephemeral Custom Tab (Chrome 136+, androidx.browser 1.9) neither reads nor
     * keeps cookies, so Zalo has to authenticate the person actually holding the phone. A browser
     * that cannot do it falls back to the ordinary tab, exactly as before.
     */
    fun launch(context: Context, appState: String) {
        val provider = CustomTabsClient.getPackageName(context, null)
        val ephemeral = provider != null && CustomTabsClient.isEphemeralBrowsingSupported(context, provider)
        val tab = CustomTabsIntent.Builder().setEphemeralBrowsingEnabled(ephemeral).build()
        if (provider != null) tab.intent.setPackage(provider)
        tab.launchUrl(context, Uri.parse(launchUrl(appState)))
    }
}
