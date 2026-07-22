package com.tappyai.core.analytics

import com.tappyai.core.logging.LoggerProvider
import javax.inject.Inject

/** Default [AnalyticsProvider] that forwards to [LoggerProvider] so events are visible in
 *  logcat during development, until a real provider is wired in (Phase 1+). Bound via
 *  [AnalyticsModule] (Phase 1A). */
class LoggingAnalyticsProvider @Inject constructor(
    private val logger: LoggerProvider,
) : AnalyticsProvider {
    override fun track(eventName: String, properties: Map<String, Any?>) {
        logger.i(TAG, "track: $eventName $properties")
    }

    override fun screen(screenName: String, properties: Map<String, Any?>) {
        logger.i(TAG, "screen: $screenName $properties")
    }

    private companion object {
        const val TAG = "Analytics"
    }
}
