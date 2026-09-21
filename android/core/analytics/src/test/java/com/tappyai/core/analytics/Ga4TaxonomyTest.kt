package com.tappyai.core.analytics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Android GA4 taxonomy is a CLOSED allowlist that must behave exactly like the
 * web one (`src/lib/analytics/ga4.ts`): only named events reach GA4, only named
 * params are forwarded, and no param key reads like PII / free text. These are pure
 * assertions on [Ga4Taxonomy.project] — no Firebase runtime needed.
 */
class Ga4TaxonomyTest {

    @Test
    fun `an event outside the taxonomy is dropped entirely`() {
        assertNull(Ga4Taxonomy.project("commerce_action_rendered", mapOf("providerId" to "lazada")))
        assertNull(Ga4Taxonomy.project("diagnostics_test_event", emptyMap()))
        assertNull(Ga4Taxonomy.project("some_future_event", mapOf("anything" to 1)))
    }

    @Test
    fun `only allowlisted params survive, everything else is stripped`() {
        val out = Ga4Taxonomy.project(
            "login",
            mapOf("method" to "google", "is_first_login" to false, "email" to "a@b.c", "user_id" to "u-1"),
        )
        assertEquals(mapOf("method" to "google", "is_first_login" to false), out)
    }

    @Test
    fun `chat_response forwards the domain only, never the reply text`() {
        val out = Ga4Taxonomy.project("chat_response", mapOf("feature" to "food", "content" to "Bún bò Huế ở Q1 …"))
        assertEquals(mapOf("feature" to "food"), out)
    }

    @Test
    fun `scam_check forwards check_type and risk level, never the checked content`() {
        val out = Ga4Taxonomy.project(
            "scam_check",
            mapOf("check_type" to "url", "risk_level" to "HIGH", "url" to "http://scam.example/pay", "message" to "gui 5tr"),
        )
        assertEquals(mapOf("check_type" to "url", "risk_level" to "HIGH"), out)
    }

    @Test
    fun `recommendation_click forwards the vertical only, never the place or id`() {
        val out = Ga4Taxonomy.project("recommendation_click", mapOf("domain" to "food", "name" to "Phở Hòa", "place_id" to "p-7"))
        assertEquals(mapOf("domain" to "food"), out)
    }

    @Test
    fun `report_submitted forwards the reason enum only`() {
        val out = Ga4Taxonomy.project("report_submitted", mapOf("reason" to "copyright", "review_id" to "r-1", "content" to "x"))
        assertEquals(mapOf("reason" to "copyright"), out)
    }

    @Test
    fun `affiliate_click forwards vertical, provider slug and the tracked boolean only`() {
        val out = Ga4Taxonomy.project(
            "affiliate_click",
            mapOf("domain" to "shopping", "provider" to "lazada", "tracked" to true, "url" to "https://lazada.vn/x", "linkId" to "l-9"),
        )
        assertEquals(mapOf("domain" to "shopping", "provider" to "lazada", "tracked" to true), out)
    }

    @Test
    fun `chat_opened carries no params`() {
        assertEquals(emptyMap<String, Any>(), Ga4Taxonomy.project("chat_opened", mapOf("conversation_id" to "c-1")))
    }

    @Test
    fun `no allowlisted param key reads like an id, name, query, url, contact or free text`() {
        val bad = Ga4Taxonomy.forbiddenParamKeys()
        assertTrue("forbidden param keys: $bad", bad.isEmpty())
    }

    @Test
    fun `null and non-scalar values are dropped, scalars are kept`() {
        val out = Ga4Taxonomy.project(
            "login",
            mapOf("method" to null, "is_first_login" to true),
        )
        assertEquals(mapOf("is_first_login" to true), out)
    }
}
