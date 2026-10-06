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
     * Two modes, on purpose (measured on a real SM-A127F, 2026-10-06):
     *
     *  - [freshBrowserSession] = false — the ordinary Custom Tab, sharing Chrome's cookies. This is
     *    the one-tap path and the ONLY one that supports Zalo's "log in with the Zalo app": the Zalo
     *    app answers by opening `googlechrome://navigate?url=id.zalo.me/account/login/native/verify
     *    ?token=…&continue=<authorization transaction>` in the regular Chrome profile, which finds
     *    the pending transaction because the cookie jar is shared. Its drawback is silent SSO — the
     *    Zalo web session of whoever used the phone before approves the permission page in about a
     *    second, so after a logout the next sign-in comes back as the same person.
     *
     *  - [freshBrowserSession] = true — an EPHEMERAL Custom Tab (no cookies read or kept; Chrome 136+,
     *    androidx.browser 1.9) for "use a different Zalo account": Zalo has to authenticate whoever
     *    is holding the phone. Zalo documents no account-picker / re-authentication parameter, so a
     *    fresh browser context is the only supported way to get one. Its limit: the in-tab login
     *    methods (phone + password, QR) work, but "log in with the Zalo app" does not — that hand-off
     *    returns into the REGULAR Chrome profile, which does not hold the ephemeral tab's
     *    authorization transaction, and ends on zalo.me with no callback.
     *
     * A browser that cannot do ephemeral falls back to the ordinary tab either way.
     */
    fun launch(context: Context, appState: String, freshBrowserSession: Boolean = false) {
        val provider = CustomTabsClient.getPackageName(context, null)
        val ephemeral = freshBrowserSession && provider != null && CustomTabsClient.isEphemeralBrowsingSupported(context, provider)
        val tab = CustomTabsIntent.Builder().setEphemeralBrowsingEnabled(ephemeral).build()
        if (provider != null) tab.intent.setPackage(provider)
        tab.launchUrl(context, Uri.parse(launchUrl(appState)))
    }
}
