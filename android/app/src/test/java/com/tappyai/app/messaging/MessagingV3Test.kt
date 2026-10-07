package com.tappyai.app.messaging

import com.tappyai.app.messaging.data.MessagesResponseDto
import com.tappyai.app.messaging.data.SendMessageResponseDto
import com.tappyai.app.messaging.data.StartThreadRequestDto
import com.tappyai.app.messaging.data.ThreadKind
import com.tappyai.app.messaging.data.ThreadsResponseDto
import com.tappyai.app.messaging.data.toDomain
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * User ↔ user messaging on Android — the web Inbox's Messages tab (`MessagesProvider`,
 * `MessagesTab`, `ThreadList`, `ThreadView`, `NewMessageSheet`) over the routes under
 * `/api/messaging`, 2026-09-17. The fixtures are the web's own wire shapes
 * (`src/lib/messaging/types.ts`, `summaries.ts`, the `[id]/messages` route).
 */
class MessagingV3Test {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = false; explicitNulls = false }

    private val threads = """
        {"threads":[
          {"id":"t1","kind":"direct","title":null,"lastMessageAt":"2026-09-17T09:00:00+07:00","lastMessage":{"body":"Đi ăn không?","senderId":"u2","createdAt":"2026-09-17T09:00:00+07:00"},"unreadCount":2,
           "participants":[{"userId":"me","fullName":"Huy","avatarUrl":null},{"userId":"u2","fullName":"Lan Nguyễn","avatarUrl":"https://cdn/lan.png"}]},
          {"id":"t2","kind":"group","title":"Nhóm cuối tuần","lastMessageAt":"2026-09-16T09:00:00+07:00","lastMessage":null,"unreadCount":0,
           "participants":[{"userId":"me","fullName":"Huy","avatarUrl":null},{"userId":"u2","fullName":"Lan Nguyễn","avatarUrl":null},{"userId":"u3","fullName":null,"avatarUrl":null}]}
        ]}
    """.trimIndent()

    @Test
    fun `the thread summary decodes the web's camelCase shape and derives title and counterpart the way types_ts does`() {
        val rows = json.decodeFromString<ThreadsResponseDto>(threads).threads.map { it.toDomain() }
        val direct = rows[0]; val group = rows[1]
        assertEquals(ThreadKind.Direct, direct.kind)
        assertEquals(2, direct.unreadCount)
        assertEquals("Đi ăn không?", direct.lastMessage?.body)
        assertEquals("u2", direct.counterpart("me")?.userId)
        assertEquals("Lan Nguyễn", direct.title("me", "Người dùng"))
        assertEquals(ThreadKind.Group, group.kind)
        assertNull("a thread with no messages yet is a real thread", group.lastMessage)
        assertNull("a group has no counterpart", group.counterpart("me"))
        assertEquals("Nhóm cuối tuần", group.title("me", "Nhóm"))
        assertEquals(3, group.participants.size)
    }

    @Test
    fun `fallbacks - a nameless counterpart and an untitled group take the caller's i18n strings`() {
        val rows = json.decodeFromString<ThreadsResponseDto>(threads).threads.map { it.toDomain() }
        val nameless = rows[0].copy(participants = listOf(rows[0].participants[0], rows[0].participants[1].copy(fullName = "  ")))
        assertEquals("Người dùng", nameless.title("me", "Người dùng"))
        assertEquals("Nhóm", rows[1].copy(title = null).title("me", "Nhóm"))
    }

    @Test
    fun `messages decode oldest-first with hasMore, and a sent message is the server's row`() {
        val page = json.decodeFromString<MessagesResponseDto>("""{"messages":[{"id":"m1","threadId":"t1","senderId":null,"body":"hi","createdAt":"2026-09-17T08:00:00Z"}],"hasMore":true}""")
        assertEquals(1, page.messages.size); assertTrue(page.hasMore)
        assertNull("author's account gone - the message stays, the name does not", page.messages[0].toDomain().senderId)
        val sent = json.decodeFromString<SendMessageResponseDto>("""{"message":{"id":"m9","threadId":"t1","senderId":"me","body":"ok","createdAt":"2026-09-17T09:00:00Z"}}""")
        assertEquals("m9", sent.message.id)
    }

    @Test
    fun `start-thread bodies are the web's - direct carries userId only, group carries userIds and an optional title`() {
        assertEquals("""{"kind":"direct","userId":"u2"}""", json.encodeToString(StartThreadRequestDto(kind = "direct", userId = "u2")))
        assertEquals("""{"kind":"group","userIds":["u2","u3"],"title":"Đi chơi"}""", json.encodeToString(StartThreadRequestDto(kind = "group", userIds = listOf("u2", "u3"), title = "Đi chơi")))
    }

    // ── Source pins ──

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    @Test
    fun `the client speaks only the five routes the web calls, and never the AI chat's`() {
        val api = src("app/src/main/java/com/tappyai/app/messaging/data/MessagingApi.kt")
        for (route in listOf("@GET(\"api/messaging/threads\")", "@POST(\"api/messaging/threads\")", "@GET(\"api/messaging/threads/{id}/messages\")", "@POST(\"api/messaging/threads/{id}/messages\")", "@POST(\"api/messaging/threads/{id}/read\")")) {
            assertTrue(route, api.contains(route))
        }
        assertFalse(api.contains("api/chat") || api.contains("api/conversations"))
        val repo = src("app/src/main/java/com/tappyai/app/messaging/data/MessagingRepository.kt")
        assertTrue("the body is bounded by the database's CHECK", repo.contains("const val MESSAGE_MAX_BODY = 4000") && repo.contains("take(MESSAGE_MAX_BODY)"))
        assertTrue("no sender id is sent - the server pins the bearer", api.contains("data class SendMessageRequestDto(val body: String)"))
    }

    @Test
    fun `the list is the web's MessagesTab - new message, a filter over what is loaded, real counts, a real empty, people search reused`() {
        val pane = src("app/src/main/java/com/tappyai/app/messaging/MessagesPane.kt")
        assertTrue(pane.contains("R.string.msg_v3_new") && pane.contains("R.string.msg_v3_search"))
        assertTrue(pane.contains("R.string.msg_v3_empty") && pane.contains("R.string.msg_v3_empty_hint"))
        assertTrue("zero renders nothing", pane.contains("if (unread) {"))
        assertTrue("realtime's stand-in - resume + poll", pane.contains("LifecycleResumeEffect(Unit)") && pane.contains("delay(MessagesViewModel.POLL_MS)"))
        val vm = src("app/src/main/java/com/tappyai/app/messaging/MessagesViewModel.kt")
        assertTrue("people search is the existing /api/users/search client", vm.contains("reviewsRepository.searchUsers(q)"))
        assertTrue("one person = direct, more = group", vm.contains("if (selected.size == 1) repository.startDirect(selected.first().id)") && vm.contains("repository.startGroup(selected.map { it.id }, groupName)"))
        assertTrue("guests load nothing", vm.contains("if (isSignedIn == true) refetch()"))
        assertTrue("message unread ONLY", vm.contains("val unreadTotal: Int get() = threads?.sumOf { it.unreadCount } ?: 0"))
    }

    @Test
    fun `the thread is the web's ThreadView - open marks read, send appends the server row, no presence, older pages by before`() {
        val vm = src("app/src/main/java/com/tappyai/app/messaging/ThreadViewModel.kt")
        assertTrue(vm.contains("repository.markRead(threadId)"))
        assertTrue(vm.contains("if (messages.none { it.id == row.id }) messages = messages + row"))
        assertTrue(vm.contains("repository.getMessages(threadId, before = oldest)"))
        assertTrue("the route argument by name, shared by both hosts", vm.contains("savedStateHandle.get<String>(\"threadId\")"))
        val screen = src("app/src/main/java/com/tappyai/app/messaging/ThreadScreen.kt")
        assertFalse("no Online, no Typing", screen.lowercase().contains("online") || screen.lowercase().contains("typing"))
        assertTrue("a group shows its real member count", screen.contains("R.string.msg_v3_group_members, thread.participants.size"))
        assertTrue(screen.contains("R.string.msg_v3_load_older") && screen.contains("imePadding()"))
    }

    @Test
    fun `both Inbox hosts route a thread to the one ThreadScreen`() {
        assertTrue(src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsRoute.kt").contains("data class MessageThread(val threadId: String) : ReviewsRoute"))
        assertTrue(src("app/src/main/java/com/tappyai/app/profile/ProfileRoute.kt").contains("data class MessageThread(val threadId: String) : ProfileRoute"))
        assertTrue(src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsNavHost.kt").contains("composable<ReviewsRoute.MessageThread> {\n            ThreadScreen("))
        assertTrue(src("app/src/main/java/com/tappyai/app/profile/ProfileTab.kt").contains("composable<ProfileRoute.MessageThread> {\n            ThreadScreen("))
    }
}
