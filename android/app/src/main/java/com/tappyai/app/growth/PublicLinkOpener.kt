package com.tappyai.app.growth

import android.app.Activity
import android.content.ComponentName
import android.net.Uri
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.browser.customtabs.CustomTabsServiceConnection

/**
 * Opens a public TappyAI web page (a `/r/<slug>` result) inside the app as a Custom Tab.
 *
 * WHY A CUSTOM TAB AND NOT A SCREEN. The public result page is the acquisition surface: it is
 * what the recipient of a shared link sees, with the follow-up box, the share button and the
 * "Mở TappyAI" entry. Re-implementing it natively would create a second rendering of the same
 * frozen payload that could drift. Showing the real page inside the app keeps one truth.
 *
 * WHY A SESSION. Custom Tabs honour App Links by default — launching our own verified URL in a
 * plain Custom Tab would hand the navigation straight back to this app, forever. Binding a
 * [CustomTabsClient] session and building the intent from it is the documented way to force the
 * URL to stay in the tab (developer.chrome.com/docs/android/custom-tabs). The connection is
 * unbound as soon as the tab is launched; nothing is kept.
 *
 * Returns false when no browser on the device offers the Custom Tabs service, in which case the
 * caller lets the app open normally — never an `ACTION_VIEW` re-dispatch, which would loop.
 *
 * 🚨 NOT YET EXERCISED ON A DEVICE. App Links are disabled by default (`TAPPYAI_APP_LINKS_ENABLED`),
 * so this code is inert until the owner enables them; the first enablement must be followed by
 * a device check of exactly this path (see docs/growth/APP_LINKS.md).
 */
object PublicLinkOpener {

    @JvmStatic
    fun open(activity: Activity, uri: Uri): Boolean {
        val browserPackage = CustomTabsClient.getPackageName(activity, null) ?: return false
        val connection = object : CustomTabsServiceConnection() {
            override fun onCustomTabsServiceConnected(name: ComponentName, client: CustomTabsClient) {
                val session = client.newSession(null)
                val intent = CustomTabsIntent.Builder(session).build()
                intent.intent.setPackage(browserPackage)
                runCatching { intent.launchUrl(activity, uri) }
                runCatching { activity.unbindService(this) }
            }

            override fun onServiceDisconnected(name: ComponentName) = Unit
        }
        return CustomTabsClient.bindCustomTabsService(activity, browserPackage, connection)
    }
}
