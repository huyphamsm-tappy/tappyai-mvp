package com.tappyai.app.chat

import com.tappyai.app.chat.data.ChatRequest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** R14 (contract fixed 29/09): one UUID v4 per chat, sent unchanged on every turn. */
class ChatSessionIdTest {

    @Test fun `a new chat gets a fresh lowercase UUID v4`() {
        val id = ChatSessionId.resolve(saved = null, historyRowId = null, stored = { null })
        assertTrue(id, ChatSessionId.isValid(id))
        assertEquals(36, id.length)
        assertEquals('4', id[14])
    }

    @Test fun `the saved id wins, so the chat keeps it across process death`() {
        val saved = "0f8fad5b-d9cb-469f-a165-70867728950e"
        assertEquals(saved, ChatSessionId.resolve(saved, historyRowId = "row-1", stored = { "7c9e6679-7425-40de-944b-e07fc1f90ae7" }))
    }

    @Test fun `a chat reopened from history reuses the id stored with its row`() {
        val stored = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
        assertEquals(stored, ChatSessionId.resolve(saved = null, historyRowId = "row-1", stored = { if (it == "row-1") stored else null }))
    }

    @Test fun `an old chat with no stored id, or a malformed one, gets a new id`() {
        val fresh = "11111111-2222-4333-8444-555555555555"
        assertEquals(fresh, ChatSessionId.resolve(null, "row-old", stored = { null }, newId = { fresh }))
        assertEquals(fresh, ChatSessionId.resolve("not-a-uuid", "row-old", stored = { "ALSO-BAD" }, newId = { fresh }))
        assertFalse(ChatSessionId.isValid("0F8FAD5B-D9CB-469F-A165-70867728950E")) // contract: lowercase hex
    }

    @Test fun `the request body carries chatSessionId at top level`() {
        val body = Json.encodeToString(ChatRequest.serializer(), ChatRequest(emptyList(), chatSessionId = "0f8fad5b-d9cb-469f-a165-70867728950e"))
        assertTrue(body, "\"chatSessionId\":\"0f8fad5b-d9cb-469f-a165-70867728950e\"" in body)
    }

    @Test fun `every turn of the chat streams with the SAME id (one per ViewModel, never regenerated)`() {
        val vm = File("src/main/java/com/tappyai/app/chat/ChatViewModel.kt").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        assertTrue(vm.contains("chatRepository.streamReply(history, chatSessionId)"))
        assertEquals(1, Regex("""ChatSessionId\.resolve\(""").findAll(vm).count())
        assertTrue(vm.contains("private val chatSessionId: String = ChatSessionId.resolve("))
    }
}
