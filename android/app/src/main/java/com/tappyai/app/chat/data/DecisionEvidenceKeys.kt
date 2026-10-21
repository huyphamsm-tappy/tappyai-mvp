package com.tappyai.app.chat.data

/**
 * ADR-024, the client half: the server answers a shopping turn with an `X-Decision-Evidence-Id`
 * response header, and the NEXT turn of the same conversation echoes it back as the body field
 * `decisionEvidenceId`. The server looks the frozen listing facts up under the caller's own id, so a
 * malformed, expired or foreign key resolves to nothing. The client carries the KEY only, never the
 * facts. Web: `ChatInterface.tsx` `onResponse`; iOS: `ChatService.chatWithContext`.
 */
internal object DecisionEvidenceKeys {
    const val HEADER = "X-Decision-Evidence-Id"

    /** A lookup key, never a fact: short, and non-blank. The server validates the format itself. */
    private const val MAX_LENGTH = 64

    fun fromHeader(value: String?): String? {
        val trimmed = value?.trim().orEmpty()
        return trimmed.takeIf { it.isNotEmpty() && it.length <= MAX_LENGTH }
    }
}

/**
 * The latest key per chat session (`chatSessionId`, one per conversation, R14). A new conversation
 * has a new session id and therefore no key, so it never inherits another conversation's evidence.
 * Bounded (least recently used goes first) so a long-lived app cannot grow it without limit.
 */
internal class DecisionEvidenceStore(private val capacity: Int = 50) {
    private val keys = object : LinkedHashMap<String, String>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean = size > capacity
    }

    @Synchronized
    fun put(sessionId: String, evidenceId: String) {
        keys[sessionId] = evidenceId
    }

    @Synchronized
    fun get(sessionId: String?): String? = sessionId?.let { keys[it] }
}
