package com.tappyai.core.analytics

/**
 * The single analytics seam for the whole app — feature modules depend on this interface,
 * never on a concrete provider SDK (Firebase/Amplitude/etc., none of which is wired yet).
 *
 * Two methods, not three: an earlier draft of this contract listed a separate `event()`
 * alongside `track()`, but both describe the same "record a named occurrence" concept with
 * no distinct semantics — collapsed to one ([track]) plus the genuinely distinct [screen].
 */
interface AnalyticsProvider {
    fun track(eventName: String, properties: Map<String, Any?> = emptyMap())
    fun screen(screenName: String, properties: Map<String, Any?> = emptyMap())
}
