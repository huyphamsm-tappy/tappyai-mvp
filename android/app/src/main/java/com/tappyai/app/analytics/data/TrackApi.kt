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
    // Shared client envelope (web `src/lib/tracking/envelope.ts`). The server treats every field as
    // optional and projects the flat columns from these; without them Android events were not
    // attributable to a platform. All are projected from the single [DeviceContext] detection.
    @SerialName("event_id") val eventId: String? = null,
    @SerialName("schema_version") val schemaVersion: Int = 1,
    @SerialName("anon_id") val anonId: String? = null,
    val platform: String? = null,
    @SerialName("app_version") val appVersion: String? = null,
    @SerialName("build_number") val buildNumber: String? = null,
    @SerialName("os_name") val osName: String? = null,
    @SerialName("os_version") val osVersion: String? = null,
    @SerialName("device_type") val deviceType: String? = null,
    val language: String? = null,
    @SerialName("session_id") val sessionId: String? = null,
    @SerialName("client_timestamp") val clientTimestamp: String? = null,
    @SerialName("device_context") val deviceContext: DeviceContext? = null,
)
