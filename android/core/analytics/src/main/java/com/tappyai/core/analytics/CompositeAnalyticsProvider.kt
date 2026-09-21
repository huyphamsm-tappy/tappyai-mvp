package com.tappyai.core.analytics

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fans every event out to both providers: [LoggingAnalyticsProvider] keeps the full
 * logcat trail for development (every internal event), while
 * [FirebaseAnalyticsProvider] forwards ONLY the closed GA4 taxonomy to the GA4
 * property. So an internal-only event (e.g. `commerce_action_rendered`) still logs
 * locally but never reaches GA4, exactly as on web where `mirrorToGa4` projects an
 * allowlisted subset of the internal tracker.
 */
@Singleton
class CompositeAnalyticsProvider @Inject constructor(
    private val logging: LoggingAnalyticsProvider,
    private val firebase: FirebaseAnalyticsProvider,
) : AnalyticsProvider {

    override fun track(eventName: String, properties: Map<String, Any?>) {
        logging.track(eventName, properties)
        firebase.track(eventName, properties)
    }

    override fun screen(screenName: String, properties: Map<String, Any?>) {
        logging.screen(screenName, properties)
        firebase.screen(screenName, properties)
    }
}
