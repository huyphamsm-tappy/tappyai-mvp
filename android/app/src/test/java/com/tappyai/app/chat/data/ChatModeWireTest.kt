package com.tappyai.app.chat.data

import com.tappyai.app.chat.ChatMode
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A1 (02/11, web parity with the frozen one-brain architecture, docs/architecture/ONE-BRAIN-FREEZE-20261102.md on the web branch):
 * every turn sends the chosen `mode` — the server reads `auto | chat | web | think | deep` (src/lib/ai/security/clientInput.ts readChatMode)
 * and treats an absent one as `chat`, so before this Android always ran as Chat. The web's default is `auto`.
 * The server decides what the mode really is (tier, thinking switch); the app only sends the person's choice.
 */
class ChatModeWireTest {

    // core:network's encoding flags: encodeDefaults stays false in production, so a field equal to its default is dropped
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test fun `the wire values are the server's five modes, and Auto is the default`() {
        assertEquals(listOf("auto", "chat", "web", "think", "deep"), ChatMode.entries.map { it.wire })
        assertEquals(ChatMode.Auto, ChatMode.Default)
    }

    @Test fun `the request body carries mode at top level, also for the default`() {
        for (m in ChatMode.entries) {
            val body = json.encodeToString(ChatRequest.serializer(), ChatRequest(emptyList(), mode = m.wire))
            assertTrue(body, "\"mode\":\"${m.wire}\"" in body)
        }
    }

    @Test fun `the stream waits for silence longer than the server's own limits (110 s a turn, 300 s Deep Research)`() {
        for (m in ChatMode.entries.filter { it != ChatMode.Deep }) assertTrue(m.name, streamReadTimeoutSeconds(m) > 110)
        assertTrue(streamReadTimeoutSeconds(ChatMode.Deep) > 300)
    }

    @Test fun `the screen's mode reaches the request`() {
        val vm = File("src/main/java/com/tappyai/app/chat/ChatViewModel.kt").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        assertTrue(vm.contains("chatRepository.streamReply(history, chatSessionId, turnMode)"))
        val repo = File("src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        assertTrue(repo.contains("mode = mode.wire"))
        assertTrue(repo.contains(".readTimeout(streamReadTimeoutSeconds(mode), TimeUnit.SECONDS)"))
    }
}
