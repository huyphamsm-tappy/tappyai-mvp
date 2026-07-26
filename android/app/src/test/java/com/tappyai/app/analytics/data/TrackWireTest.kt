package com.tappyai.app.analytics.data

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pins the `/api/track` request body shape against the web (`{ events: [{ event_type, metadata }] }`). */
class TrackWireTest {

    private val json = Json { encodeDefaults = true }

    @Test
    fun `track body matches the web events array shape`() {
        val body = json.encodeToString(
            TrackRequestDto(
                listOf(
                    TrackEventDto(
                        eventType = "review_like",
                        metadata = buildJsonObject {
                            put("review_id", "r1")
                            put("liked", true)
                        },
                    ),
                ),
            ),
        )
        assertTrue(body.contains("\"events\""))
        assertTrue(body.contains("\"event_type\":\"review_like\"")) // snake_case wire key
        assertTrue(body.contains("\"metadata\""))
        assertTrue(body.contains("\"review_id\":\"r1\""))
        assertTrue(body.contains("\"liked\":true"))
    }

    /**
     * Pins the shared client envelope (web `src/lib/tracking/envelope.ts`) so an Android event is
     * platform-attributable. Regression guard for the RC fix where events previously shipped with
     * only `{event_type, metadata}` → `platform=null` in the rollups. The snake_case wire keys are
     * the load-bearing contract the server projects its flat columns from.
     */
    @Test
    fun `event carries the platform envelope with snake_case device_context keys`() {
        val device = DeviceContext(
            platform = "android",
            osName = "Android",
            osVersion = "14",
            browserName = "unknown",
            browserVersion = "unknown",
            deviceType = "phone",
            manufacturer = "Samsung",
            deviceModel = "SM-A125F",
            screenWidth = 720,
            screenHeight = 1600,
            pixelRatio = 2.75f,
            colorScheme = "dark",
            locale = "vi-VN",
            timezone = "Asia/Ho_Chi_Minh",
            appVersion = "0.1.0",
            buildNumber = "1",
            sdkVersion = "unknown",
            networkType = "wifi",
            isPwa = false,
        )
        val body = json.encodeToString(
            TrackRequestDto(
                listOf(
                    TrackEventDto(
                        eventType = "page_view",
                        metadata = buildJsonObject { put("path", "/reviews") },
                        eventId = "e-1",
                        anonId = "a-1",
                        platform = "android",
                        appVersion = "0.1.0",
                        buildNumber = "1",
                        osName = "Android",
                        osVersion = "14",
                        deviceType = "phone",
                        language = "vi-VN",
                        sessionId = "s-1",
                        clientTimestamp = "2026-07-26T10:00:00Z",
                        deviceContext = device,
                    ),
                ),
            ),
        )
        // Flat envelope columns the server indexes.
        assertTrue(body.contains("\"platform\":\"android\""))
        assertTrue(body.contains("\"event_id\":\"e-1\""))
        assertTrue(body.contains("\"schema_version\":1"))
        assertTrue(body.contains("\"anon_id\":\"a-1\""))
        assertTrue(body.contains("\"app_version\":\"0.1.0\""))
        assertTrue(body.contains("\"build_number\":\"1\""))
        assertTrue(body.contains("\"os_name\":\"Android\""))
        assertTrue(body.contains("\"os_version\":\"14\""))
        assertTrue(body.contains("\"device_type\":\"phone\""))
        assertTrue(body.contains("\"session_id\":\"s-1\""))
        assertTrue(body.contains("\"client_timestamp\":\"2026-07-26T10:00:00Z\""))
        // device_context object with its snake_case keys (stored verbatim as jsonb).
        assertTrue(body.contains("\"device_context\""))
        assertTrue(body.contains("\"device_model\":\"SM-A125F\""))
        assertTrue(body.contains("\"screen_width\":720"))
        assertTrue(body.contains("\"color_scheme\":\"dark\""))
        assertTrue(body.contains("\"network_type\":\"wifi\""))
        assertTrue(body.contains("\"is_pwa\":false"))
    }
}
