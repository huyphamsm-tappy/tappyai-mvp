package com.tappyai.app.chat.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ADR-024 client half (web `ChatInterface` `onResponse`, iOS `decisionEvidenceId`): the server's header
 * key is stored per chat session and echoed on that conversation's next turn — never shared across
 * conversations, never sent when absent, and never a fact the client could have invented.
 */
class DecisionEvidenceKeysTest {

    private val json = Json { encodeDefaults = false; explicitNulls = false }

    @Test
    fun `a header key is kept trimmed, and blank or oversized values are refused`() {
        assertEquals("0f8fad5b-d9cb-469f-a165-70867728950e", DecisionEvidenceKeys.fromHeader(" 0f8fad5b-d9cb-469f-a165-70867728950e "))
        assertNull(DecisionEvidenceKeys.fromHeader(null))
        assertNull(DecisionEvidenceKeys.fromHeader("   "))
        assertNull(DecisionEvidenceKeys.fromHeader("x".repeat(65)))
    }

    @Test
    fun `the key is stored per chat session and a new session has none`() {
        val store = DecisionEvidenceStore()
        store.put("session-a", "key-1")

        assertEquals("key-1", store.get("session-a"))
        assertNull("a new conversation never inherits another conversation's key", store.get("session-b"))
        assertNull(store.get(null))
    }

    @Test
    fun `the latest key wins for the same session`() {
        val store = DecisionEvidenceStore()
        store.put("session-a", "key-1")
        store.put("session-a", "key-2")
        assertEquals("key-2", store.get("session-a"))
    }

    @Test
    fun `the store is bounded and drops the least recently used session`() {
        val store = DecisionEvidenceStore(capacity = 2)
        store.put("a", "ka")
        store.put("b", "kb")
        store.get("a") // a is now the most recently used
        store.put("c", "kc")

        assertEquals("ka", store.get("a"))
        assertNull("b was the least recently used and is gone", store.get("b"))
        assertEquals("kc", store.get("c"))
    }

    @Test
    fun `the request carries the key only when there is one`() {
        val withKey = json.encodeToString(ChatRequest.serializer(), ChatRequest(emptyList(), decisionEvidenceId = "key-1"))
        assertEquals("""{"messages":[],"decisionEvidenceId":"key-1"}""", withKey)

        val without = json.encodeToString(ChatRequest.serializer(), ChatRequest(emptyList()))
        assertEquals("""{"messages":[]}""", without)
        assertFalse(without.contains("decisionEvidenceId"))
    }

    @Test
    fun `the key is named exactly as the server reads it`() {
        // Server: `readDecisionEvidenceId` reads body.decisionEvidenceId and the header X-Decision-Evidence-Id.
        assertTrue(DecisionEvidenceKeys.HEADER == "X-Decision-Evidence-Id")
        val body = json.encodeToString(ChatRequest.serializer(), ChatRequest(emptyList(), decisionEvidenceId = "k"))
        assertTrue(body.contains("\"decisionEvidenceId\":\"k\""))
    }
}
