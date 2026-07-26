package com.tappyai.app.analytics

import com.tappyai.app.analytics.data.TrackApi
import com.tappyai.app.analytics.data.TrackEventDto
import com.tappyai.app.analytics.data.TrackRequestDto
import com.tappyai.core.analytics.AnalyticsProvider
import com.tappyai.core.logging.LoggerProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The real [AnalyticsProvider]: forwards events to `POST /api/track` so Android contributes to the
 * personalization signal (the `LoggingAnalyticsProvider` in core:analytics only logged, so Android
 * previously fed the recs pipeline nothing). Fire-and-forget on a background scope — telemetry must
 * never block or fail a user action; still logs for parity with the old dev behaviour.
 */
@Singleton
class NetworkAnalyticsProvider @Inject constructor(
    private val api: TrackApi,
    private val logger: LoggerProvider,
    private val envelopeBuilder: AnalyticsEnvelopeBuilder,
) : AnalyticsProvider {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun track(eventName: String, properties: Map<String, Any?>) {
        logger.i(TAG, "track: $eventName $properties")
        send(eventName, properties)
    }

    override fun screen(screenName: String, properties: Map<String, Any?>) {
        logger.i(TAG, "screen: $screenName $properties")
        send("page_view", properties + ("path" to screenName))
    }

    private fun send(eventType: String, properties: Map<String, Any?>) {
        val metadata = toJsonObject(properties)
        scope.launch {
            // Attach the shared envelope (web parity) — flat fields projected from one detection.
            val env = envelopeBuilder.build()
            val d = env.device
            val event = TrackEventDto(
                eventType = eventType,
                metadata = metadata,
                eventId = env.eventId,
                schemaVersion = 1,
                anonId = env.anonId,
                platform = d.platform,
                appVersion = d.appVersion,
                buildNumber = d.buildNumber,
                osName = d.osName,
                osVersion = d.osVersion,
                deviceType = d.deviceType,
                language = d.locale,
                sessionId = env.sessionId,
                clientTimestamp = env.clientTimestamp,
                deviceContext = d,
            )
            runCatching { api.track(TrackRequestDto(listOf(event))) }
                .onFailure { logger.w(TAG, "track '$eventType' failed: ${it.message}") }
        }
    }

    private fun toJsonObject(properties: Map<String, Any?>): JsonObject = buildJsonObject {
        properties.forEach { (key, value) ->
            put(
                key,
                when (value) {
                    null -> JsonNull
                    is String -> JsonPrimitive(value)
                    is Boolean -> JsonPrimitive(value)
                    is Number -> JsonPrimitive(value)
                    else -> JsonPrimitive(value.toString())
                },
            )
        }
    }

    private companion object {
        const val TAG = "Analytics"
    }
}
