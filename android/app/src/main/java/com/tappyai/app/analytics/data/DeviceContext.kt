package com.tappyai.app.analytics.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Android implementation of the cross-platform analytics DeviceContext contract — mirrors the web
 * client's `src/lib/tracking/deviceContext.ts`. Sent verbatim in each `/api/track` event's
 * `device_context`; the flat envelope fields on [TrackEventDto] are PROJECTED from this same object
 * (one detection path, exactly like web's envelope).
 *
 * Honesty rule (spec): undetectable STRING fields are `"unknown"` (never fabricated); undetectable
 * NUMERIC fields are `null` (a number cannot truthfully hold `"unknown"`, and a fabricated 0 would
 * imply a real 0-px screen). The field NAMES (snake_case via [SerialName]) are the load-bearing
 * contract — the server indexes the flat columns and stores this object in the `device_context`
 * jsonb column.
 */
@Serializable
data class DeviceContext(
    val platform: String,
    @SerialName("os_name") val osName: String,
    @SerialName("os_version") val osVersion: String,
    @SerialName("browser_name") val browserName: String,
    @SerialName("browser_version") val browserVersion: String,
    @SerialName("device_type") val deviceType: String,
    val manufacturer: String,
    @SerialName("device_model") val deviceModel: String,
    @SerialName("screen_width") val screenWidth: Int?,
    @SerialName("screen_height") val screenHeight: Int?,
    @SerialName("pixel_ratio") val pixelRatio: Float?,
    @SerialName("color_scheme") val colorScheme: String,
    val locale: String,
    val timezone: String,
    @SerialName("app_version") val appVersion: String,
    @SerialName("build_number") val buildNumber: String,
    @SerialName("sdk_version") val sdkVersion: String,
    @SerialName("network_type") val networkType: String,
    // Native app is definitively not a Progressive Web App — web sends true/false/'unknown';
    // the honest native answer is always false.
    @SerialName("is_pwa") val isPwa: Boolean,
)
