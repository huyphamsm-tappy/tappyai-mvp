package com.tappyai.app.share

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Retrofit contract for `POST /api/plans/share` (src/app/api/plans/share/route.ts).
 *
 * Built from the shared [retrofit2.Retrofit] (core:network), so [com.tappyai.core.network.AuthInterceptor]
 * attaches the Bearer token the route requires — the same `getRequestUser()` Bearer path the web
 * client's cookie session lands on. Signed out is a 401; an anonymous session is a 403.
 */
interface PlanShareApi {
    @POST("api/plans/share")
    suspend fun publish(@Body body: PlanSharePublishRequest): PlanSharePublishResponse
}

/**
 * The request body: `{ "plan": <the [TAPPY_PLAN] object> }`.
 *
 * [plan] is a [JsonObject], not [com.tappyai.app.chat.TappyPlan]: the block is sent AS THE MODEL
 * EMITTED IT (parsed once so the JSON is well-formed), so fields this client does not model —
 * `photo_url`, written by the server-side enrichment — reach the server intact. The server
 * whitelists it (`toPlanShareSnapshot`) before storing anything; this client adds nothing else.
 */
@Serializable
data class PlanSharePublishRequest(val plan: JsonObject)

/**
 * What the route answers: `{ id, path, url, reused }`. Every field optional here so a
 * malformed or partial body decodes and is then REJECTED by [TappyShare.planShareUrl] on the
 * id — a missing id is "no link", never a guessed one.
 */
@Serializable
data class PlanSharePublishResponse(
    val id: String? = null,
    val path: String? = null,
    val url: String? = null,
    val reused: Boolean? = null,
)
