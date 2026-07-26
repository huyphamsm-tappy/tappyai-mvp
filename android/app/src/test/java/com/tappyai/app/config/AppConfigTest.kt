package com.tappyai.app.config

import com.tappyai.app.onboarding.data.AppConfigDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the /api/config upload-limit consumption: the wire shape parses, defaults mirror prod, and
 * the 62s accept tolerance is DERIVED (advertised + 2), never a stored value — the "62 never in any
 * payload/UI" rule.
 */
class AppConfigTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `defaults mirror current prod values`() {
        assertEquals(6, UploadLimits.DEFAULT.maxPhotos)
        assertEquals(50, UploadLimits.DEFAULT.maxVideoSizeMb)
        assertEquals(60, UploadLimits.DEFAULT.maxVideoDurationSec)
        assertEquals(50L * 1024 * 1024, UploadLimits.DEFAULT.maxVideoSizeBytes)
        // 62 is advertised + 2, computed — not stored anywhere.
        assertEquals(62.0, UploadLimits.DEFAULT.maxVideoDurationAcceptSec, 0.0)
    }

    @Test
    fun `accept tolerance always tracks advertised + 2, never a fixed 62`() {
        assertEquals(47.0, UploadLimits(6, 50, 45).maxVideoDurationAcceptSec, 0.0)
        assertEquals(92.0, UploadLimits(6, 50, 90).maxVideoDurationAcceptSec, 0.0)
    }

    @Test
    fun `config payload parses the upload block`() {
        val payload = """
            {"freemium":{"freeDailyLimit":15,"anonDailyLimit":5},
             "flags":{"showProUpgrade":false,"showAppConnections":false},
             "upload":{"maxPhotosPerReview":8,"maxVideoSizeMb":80,"maxVideoDurationSec":90},
             "onboarding":{"interests":[],"cities":[]}}
        """.trimIndent()
        val config = json.decodeFromString<AppConfigDto>(payload)
        assertEquals(8, config.upload.maxPhotosPerReview)
        assertEquals(80, config.upload.maxVideoSizeMb)
        assertEquals(90, config.upload.maxVideoDurationSec)
        assertEquals(15, config.freemium.freeDailyLimit)
    }

    @Test
    fun `missing blocks fall back to safe defaults`() {
        val config = json.decodeFromString<AppConfigDto>("""{"onboarding":{"interests":[],"cities":[]}}""")
        assertEquals(6, config.upload.maxPhotosPerReview)
        assertEquals(60, config.upload.maxVideoDurationSec)
        assertEquals(false, config.flags.showProUpgrade)
    }
}
