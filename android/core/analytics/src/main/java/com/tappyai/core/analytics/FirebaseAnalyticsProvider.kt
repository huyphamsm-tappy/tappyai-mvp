package com.tappyai.core.analytics

import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sends the closed GA4 funnel taxonomy ([Ga4Taxonomy]) to Firebase Analytics, which
 * populates the SAME GA4 property the web gtag layer does — once the Firebase
 * project is linked to that property in the console. This is the ONLY class that
 * touches the Firebase Analytics SDK.
 *
 * Privacy is enforced HERE, not at call sites: an event absent from the taxonomy is
 * dropped, and only the allowlisted enum / boolean params survive — never ids,
 * place / product names, queries, message or URL content, tokens or user data.
 * GA4 event params are string / number only, so a boolean is written as
 * "true" / "false".
 */
@Singleton
class FirebaseAnalyticsProvider @Inject constructor(
    private val firebase: FirebaseAnalytics,
) : AnalyticsProvider {

    override fun track(eventName: String, properties: Map<String, Any?>) {
        val params = Ga4Taxonomy.project(eventName, properties) ?: return
        firebase.logEvent(eventName, params.toBundle())
    }

    override fun screen(screenName: String, properties: Map<String, Any?>) {
        // Firebase's recommended screen_view, carrying only the (static, non-PII)
        // screen name with any id-like segment collapsed.
        firebase.logEvent(
            FirebaseAnalytics.Event.SCREEN_VIEW,
            Bundle().apply { putString(FirebaseAnalytics.Param.SCREEN_NAME, sanitizeScreen(screenName)) },
        )
    }

    private fun Map<String, Any>.toBundle(): Bundle = Bundle().apply {
        for ((k, v) in this@toBundle) when (v) {
            is String -> putString(k, v)
            is Boolean -> putString(k, v.toString())
            is Int -> putLong(k, v.toLong())
            is Long -> putLong(k, v)
            is Float -> putDouble(k, v.toDouble())
            is Double -> putDouble(k, v)
        }
    }

    private companion object {
        val UUID_SEGMENT =
            Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
        fun sanitizeScreen(name: String): String = UUID_SEGMENT.replace(name, "_id")
    }
}
