package com.tappyai.core.analytics

/**
 * THE GA4 TAXONOMY for Android — the exact mirror of the web allowlist
 * (`src/lib/analytics/ga4.ts` `GA4_EVENT_MAP`). It is a CLOSED allowlist:
 *
 *  - an event NOT named here is never sent to Firebase / GA4 (so internal-only
 *    events such as `commerce_action_rendered` stay in logcat and never reach the
 *    property), and
 *  - for an event that IS named, ONLY the parameter keys listed are forwarded —
 *    every other key (ids, place / product names, queries, message or URL content,
 *    tokens, any user data) is dropped HERE, not left to call sites.
 *
 * Same event names and params as web, so the web (gtag) and Android (Firebase)
 * clients populate one GA4 property identically. Booleans are legitimate values;
 * the Firebase provider coerces them to strings because GA4 params are string /
 * number only.
 */
object Ga4Taxonomy {

    /** GA4 event name → the ONLY parameter keys forwarded (all low-cardinality enums / booleans). */
    val EVENTS: Map<String, Set<String>> = mapOf(
        // Auth — Google recommended names.
        "sign_up" to setOf("method"),
        "login" to setOf("method", "is_first_login"),
        "login_failed" to setOf("method", "reason"),
        "logout" to setOf("method"),
        // Main chat / AI — one hit per completed answer; feature is the domain, never the text.
        "chat_response" to setOf("feature"),
        // Saves / reviews / feed.
        "save_place" to setOf("place_type", "source"),
        "search" to setOf("search_type"),
        "review_like" to setOf("liked"),
        "share" to setOf("content_type"),
        // Funnel completeness (RUNBOOK §3.19).
        "recommendation_click" to setOf("domain"),
        "report_submitted" to setOf("reason"),
        "scam_check" to setOf("check_type", "risk_level"),
        "chat_opened" to emptySet(),
        "affiliate_click" to setOf("domain", "provider", "tracked"),
        // The "Tìm trên …" search-redirect link on a shopping card was tapped. Separate
        // from affiliate_click (this is a search redirect, not an affiliate link).
        // `platform` is the marketplace enum only, never the seller string / product / URL.
        "shopping_search_click" to setOf("domain", "platform"),
    )

    /** A param key must never read like an id, name, query, url, contact or free text. */
    private val FORBIDDEN_KEY =
        Regex("(^|_)(id|ids|email|name|query|q|text|content|message|token|phone|address|lat|lng|url)$", RegexOption.IGNORE_CASE)

    fun isAllowed(eventName: String): Boolean = EVENTS.containsKey(eventName)

    /**
     * The filtered params for [eventName], or `null` when the event is not in the
     * taxonomy (the caller then sends nothing to Firebase). Only allowed keys whose
     * value is a non-null scalar survive.
     */
    fun project(eventName: String, properties: Map<String, Any?>): Map<String, Any>? {
        val allowed = EVENTS[eventName] ?: return null
        val out = LinkedHashMap<String, Any>()
        for (key in allowed) {
            when (val v = properties[key]) {
                is String, is Boolean, is Int, is Long, is Double, is Float -> out[key] = v
                else -> Unit // null or non-scalar → dropped
            }
        }
        return out
    }

    /** Guard used by the unit test: no allowlisted param key may read like PII / free text. */
    fun forbiddenParamKeys(): List<Pair<String, String>> =
        EVENTS.flatMap { (event, keys) -> keys.filter { FORBIDDEN_KEY.containsMatchIn(it) }.map { event to it } }
}
