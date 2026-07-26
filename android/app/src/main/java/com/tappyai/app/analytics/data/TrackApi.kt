package com.tappyai.app.analytics.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * `POST /api/track` — the personalization telemetry sink. The web batches events; Android sends one
 * per call (the endpoint accepts an array either way). Best-effort: the backend swallows failures
 * and unknown event types, so callers never gate on the result.
 */
interface TrackApi {
    @POST("api/track")
    suspend fun track(@Body body: TrackRequestDto): Response<Unit>
}

@Serializable
data class TrackRequestDto(val events: List<TrackEventDto>)

@Serializable
data class TrackEventDto(
    @SerialName("event_type") val eventType: String,
    val metadata: JsonObject = JsonObject(emptyMap()),
)
