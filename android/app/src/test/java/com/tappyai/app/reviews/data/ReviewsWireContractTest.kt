package com.tappyai.app.reviews.data

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the JSON Android sends to `POST /api/reviews`.
 *
 * The music-reuse payload (`{version, trackId, startSec, volume}`) was removed with the feature
 * (music reuse retired; the backend endpoints answer 410) — the composer no longer attaches a
 * borrowed sound, so `CreateReviewRequestDto` carries no `music` field. This still pins the wire
 * shape so a future default-valued field can't silently drop off the wire (`encodeDefaults=false`,
 * the same trap as `BlobTokenRequestDto.type`, RC audit).
 *
 * [json] mirrors core:network's real configuration for the flags that affect *encoding*:
 * `encodeDefaults` stays at its default (false) exactly like the production instance.
 */
class ReviewsWireContractTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `create review body carries place, rating and body, and no music field`() {
        val body = CreateReviewRequestDto(
            placeId = "place-1",
            placeName = "Quán A",
            body = "Ngon!",
            rating = 5,
        )

        assertEquals(
            """{"placeId":"place-1","placeName":"Quán A","body":"Ngon!","rating":5}""",
            json.encodeToString(body),
        )
    }
}
