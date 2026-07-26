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
}
