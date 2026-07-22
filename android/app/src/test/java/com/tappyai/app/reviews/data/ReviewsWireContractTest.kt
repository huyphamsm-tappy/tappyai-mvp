package com.tappyai.app.reviews.data

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the JSON Android sends to `POST /api/reviews` for the cross-platform music payload —
 * `{version, trackId, startSec, volume}` (web `src/app/api/reviews/route.ts`).
 *
 * REGRESSION (permanent): the backend hard-rejects a missing `version` ("unsupported music
 * version") and NaN-fails on a missing `startSec`/`volume` (`Number(undefined)`). The original
 * `MusicSelectionDto` gave those fields default values, and the shared prod Json's
 * `encodeDefaults=false` silently dropped them from the wire — so EVERY Android review with music
 * would 400. Same trap as `BlobTokenRequestDto.type` (RC audit). This test fails on any DTO that
 * reintroduces default values on the music payload.
 *
 * [json] mirrors core:network's real configuration for the flags that affect *encoding*:
 * `encodeDefaults` stays at its default (false) exactly like the production instance.
 */
class ReviewsWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** An un-trimmed pick (startSec 0, volume 1.0 — the values a default would silently eat). */
    @Test
    fun `music payload keeps version, startSec and volume on the wire at their common values`() {
        val body = MusicSelectionDto(
            version = MusicSelectionDto.PAYLOAD_VERSION,
            trackId = "track-1",
            startSec = 0,
            volume = 1.0,
        )

        assertEquals(
            """{"version":1,"trackId":"track-1","startSec":0,"volume":1.0}""",
            json.encodeToString(body),
        )
    }

    @Test
    fun `create review body carries the full music selection`() {
        val body = CreateReviewRequestDto(
            placeId = "place-1",
            placeName = "Quán A",
            body = "Ngon!",
            rating = 5,
            music = MusicSelectionDto(
                version = MusicSelectionDto.PAYLOAD_VERSION,
                trackId = "track-1",
                startSec = 12,
                volume = 0.6,
            ),
        )

        assertEquals(
            """{"placeId":"place-1","placeName":"Quán A","body":"Ngon!","rating":5,""" +
                """"music":{"version":1,"trackId":"track-1","startSec":12,"volume":0.6}}""",
            json.encodeToString(body),
        )
    }
}
