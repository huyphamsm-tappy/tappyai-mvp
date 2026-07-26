package com.tappyai.app.analytics

import android.content.Context
import android.content.SharedPreferences
import android.content.res.Configuration
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import com.tappyai.app.BuildConfig
import com.tappyai.app.analytics.data.DeviceContext
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Builds the shared analytics envelope attached to every `/api/track` event, mirroring the web
 * tracker (`src/lib/tracking/envelope.ts`). Android previously sent only `{event_type, metadata}`,
 * so its events landed with `platform=null`/`device_context=null` and were invisible to the
 * platform-segmented rollups. This fills the same envelope shape NATIVELY: a stable per-device
 * anon id, a 30-min-inactivity session id, an idempotency `event_id` for server-side dedup, and the
 * flat device fields projected from a single [DeviceContext] detection.
 *
 * Best-effort by contract: every read is defensive so envelope construction can never throw on the
 * fire-and-forget telemetry path.
 */
@Singleton
class AnalyticsEnvelopeBuilder @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    data class Envelope(
        val eventId: String,
        val anonId: String,
        val sessionId: String,
        val clientTimestamp: String,
        val device: DeviceContext,
    )

    fun build(): Envelope = Envelope(
        eventId = UUID.randomUUID().toString(),
        anonId = anonId(),
        sessionId = sessionId(),
        clientTimestamp = Instant.now().toString(),
        device = detectDeviceContext(),
    )

    /** Stable per-device anonymous id (mirrors web localStorage `tappy_analytics_anon`). */
    private fun anonId(): String {
        prefs.getString(KEY_ANON, null)?.let { return it }
        val id = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_ANON, id).apply()
        return id
    }

    /** Session id: a new id after 30 min of inactivity (Data Dictionary §4 session rule). */
    @Synchronized
    private fun sessionId(): String {
        val now = System.currentTimeMillis()
        val last = prefs.getLong(KEY_SESSION_LAST, 0L)
        val existing = prefs.getString(KEY_SESSION_ID, null)
        val id = if (existing != null && now - last < THIRTY_MIN) existing else UUID.randomUUID().toString()
        prefs.edit().putString(KEY_SESSION_ID, id).putLong(KEY_SESSION_LAST, now).apply()
        return id
    }

    private fun detectDeviceContext(): DeviceContext {
        val res = context.resources
        val dm = res.displayMetrics
        val isTablet = res.configuration.smallestScreenWidthDp >= TABLET_MIN_SW_DP
        val colorScheme = when (res.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
            Configuration.UI_MODE_NIGHT_YES -> "dark"
            Configuration.UI_MODE_NIGHT_NO -> "light"
            else -> "unknown"
        }
        return DeviceContext(
            platform = "android",
            osName = "Android",
            osVersion = Build.VERSION.RELEASE ?: "unknown",
            browserName = "unknown",
            browserVersion = "unknown",
            deviceType = if (isTablet) "tablet" else "phone",
            manufacturer = Build.MANUFACTURER ?: "unknown",
            deviceModel = Build.MODEL ?: "unknown",
            screenWidth = dm.widthPixels.takeIf { it > 0 },
            screenHeight = dm.heightPixels.takeIf { it > 0 },
            pixelRatio = dm.density.takeIf { it > 0f },
            colorScheme = colorScheme,
            locale = Locale.getDefault().toLanguageTag(),
            timezone = runCatching { TimeZone.getDefault().id }.getOrDefault("unknown"),
            appVersion = BuildConfig.VERSION_NAME,
            buildNumber = BuildConfig.VERSION_CODE.toString(),
            // No separate versioned analytics SDK on Android (the tracker is inline), so 'unknown'
            // rather than a fabricated version — same honesty rule the web module uses.
            sdkVersion = "unknown",
            networkType = detectNetworkType(),
            isPwa = false,
        )
    }

    /** Physical connectivity medium — the cross-platform-comparable axis the web contract prefers. */
    private fun detectNetworkType(): String = runCatching {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return "unknown"
        val network = cm.activeNetwork ?: return "none"
        val caps = cm.getNetworkCapabilities(network) ?: return "unknown"
        when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }
    }.getOrDefault("unknown")

    private companion object {
        const val PREFS = "tappy_analytics"
        const val KEY_ANON = "anon_id"
        const val KEY_SESSION_ID = "session_id"
        const val KEY_SESSION_LAST = "session_last"
        const val THIRTY_MIN = 30 * 60 * 1000L
        const val TABLET_MIN_SW_DP = 600
    }
}
