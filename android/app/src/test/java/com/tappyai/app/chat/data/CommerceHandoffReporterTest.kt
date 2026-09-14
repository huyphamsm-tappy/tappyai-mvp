package com.tappyai.app.chat.data

import com.tappyai.app.chat.LiveCommerceFacts
import com.tappyai.core.analytics.AnalyticsProvider
import com.tappyai.core.logging.LoggerProvider
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

/**
 * The commerce handoff beacon (CCP event 6) on Android: opaque ids only, `platform = "android"`,
 * fired AFTER the merchant intent, never gating it, and the four analytics events the
 * observability bridge distinguishes — rendered · tapped · handoff attempted · handoff failed.
 */
class CommerceHandoffReporterTest {

    private class RecordingApi : CommerceHandoffApi {
        val posted = CompletableDeferred<CommerceHandoffBodyDto>()
        var fail = false
        override suspend fun postHandoff(body: CommerceHandoffBodyDto): Response<Unit> {
            posted.complete(body)
            if (fail) throw IllegalStateException("boom")
            return Response.success(Unit)
        }
    }

    private class RecordingAnalytics : AnalyticsProvider {
        val events = mutableListOf<Pair<String, Map<String, Any?>>>()
        override fun track(eventName: String, properties: Map<String, Any?>) { events += eventName to properties }
        override fun screen(screenName: String, properties: Map<String, Any?>) = Unit
    }

    private val silent = object : LoggerProvider {
        override fun d(tag: String, message: String) = Unit
        override fun i(tag: String, message: String) = Unit
        override fun w(tag: String, message: String, throwable: Throwable?) = Unit
        override fun e(tag: String, message: String, throwable: Throwable?) = Unit
    }

    private val facts = LiveCommerceFacts(
        linkId = "b2c3d4e5f60718293a4b5c6d", requestId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", providerId = "tiktokshop",
        depth = 3, guestDepth = 3, authRequiredAt = "before_checkout", loginRequired = true, handoff = "merchant_login",
        freshnessType = "static", capability = "product_detail",
    )

    @Test
    fun `a tap that opened the merchant posts the opaque ids as android and records tapped + attempted`() = runBlocking {
        val api = RecordingApi()
        val analytics = RecordingAnalytics()
        RealCommerceHandoffReporter(api, analytics, silent).tapped(facts, opened = true)
        val body = withTimeout(5_000) { api.posted.await() }
        assertEquals(CommerceHandoffBodyDto(linkId = facts.linkId, requestId = facts.requestId, platform = "android"), body)
        assertEquals(listOf("commerce_action_tapped", "commerce_handoff_attempted"), analytics.events.map { it.first })
        assertEquals("tiktokshop", analytics.events[0].second["providerId"])
        assertEquals(true, analytics.events[0].second["loginRequired"])
        // Never the URL, never the person.
        assertTrue(analytics.events.none { e -> e.second.keys.any { it == "url" || it == "userId" } })
    }

    @Test
    fun `nothing could open the URL - failed is recorded and no beacon is sent`() {
        val api = RecordingApi()
        val analytics = RecordingAnalytics()
        RealCommerceHandoffReporter(api, analytics, silent).tapped(facts, opened = false)
        assertEquals(listOf("commerce_action_tapped", "commerce_handoff_failed"), analytics.events.map { it.first })
        assertEquals("no_activity", analytics.events[1].second["reason"])
        assertTrue(!api.posted.isCompleted)
    }

    @Test
    fun `a dead endpoint never surfaces - the failure is an analytics event only`() = runBlocking {
        val api = RecordingApi().apply { fail = true }
        val analytics = RecordingAnalytics()
        RealCommerceHandoffReporter(api, analytics, silent).tapped(facts, opened = true)
        withTimeout(5_000) { api.posted.await() }
        // The failure event lands on the IO scope after the throw; give it a moment.
        val deadline = System.currentTimeMillis() + 5_000
        while (analytics.events.none { it.first == "commerce_handoff_failed" } && System.currentTimeMillis() < deadline) Thread.sleep(20)
        assertEquals("beacon", analytics.events.first { it.first == "commerce_handoff_failed" }.second["reason"])
    }

    @Test
    fun `rendered is its own event and a blank id sends nothing`() {
        val api = RecordingApi()
        val analytics = RecordingAnalytics()
        val reporter = RealCommerceHandoffReporter(api, analytics, silent)
        reporter.rendered(facts)
        reporter.tapped(facts.copy(linkId = ""), opened = true)
        assertEquals(listOf("commerce_action_rendered", "commerce_action_tapped", "commerce_handoff_attempted"), analytics.events.map { it.first })
        assertTrue(!api.posted.isCompleted)
    }
}
