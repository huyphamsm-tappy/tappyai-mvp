package com.tappyai.app.chat

import com.tappyai.app.chat.data.streamReadTimeoutSeconds
import com.tappyai.app.membership.data.PlanAccess
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// ── Android chat architecture freeze 02/11/2026 (owner: "đóng băng android") ─────────────────────────────────────────────────────────────
//
// The frozen shape of the app's chat is written in docs/architecture/ANDROID-CHAT-FREEZE-20261102.md. This test pins the values and the
// wiring that shape rests on. A red line here is not a test to update: changing one of these is an architecture change, and it needs the
// owner's approval and a new dated entry in that document first.
class AndroidArchitectureFreezeTest {
    private fun file(path: String): String =
        listOf(File(path), File("app/$path"), File("../../$path"), File("../$path")).first { it.exists() }.readText()

    private fun chat(p: String) = file("src/main/java/com/tappyai/app/chat/$p")

    @Test fun `the freeze document exists and names this test`() {
        val doc = listOf(File("docs/architecture/ANDROID-CHAT-FREEZE-20261102.md"), File("../../docs/architecture/ANDROID-CHAT-FREEZE-20261102.md"), File("../docs/architecture/ANDROID-CHAT-FREEZE-20261102.md"))
            .first { it.exists() }.readText()
        assertTrue(doc.contains("AndroidArchitectureFreezeTest.kt"))
    }

    @Test fun `modes - five on the wire, Auto by default, the menu keeps only Deep Research`() {
        assertEquals(listOf("auto", "chat", "web", "think", "deep"), ChatMode.entries.map { it.wire })
        assertEquals(ChatMode.Auto, ChatMode.Default)
        assertEquals(listOf(ChatMode.Deep), ChatMode.menu)
        assertEquals(ChatMode.Auto, ChatMode.Deep.afterSend())
    }

    @Test fun `the menu follows the plan, and an unknown plan keeps it whole`() {
        assertEquals(ChatMode.menu, ChatMode.menuFor(null))
        assertEquals(emptyList<ChatMode>(), ChatMode.menuFor(PlanAccess(signedIn = false, state = null, planId = null)))
        assertEquals(emptyList<ChatMode>(), ChatMode.menuFor(PlanAccess(signedIn = true, state = "EXPIRED", planId = "coco")))
        for (plan in listOf("pip", "momo", "coco", "promax1m", "promax3m")) assertEquals(ChatMode.menu, ChatMode.menuFor(PlanAccess(true, "ACTIVE", plan)))
    }

    @Test fun `the stream - nothing dropped, silence limits 130 and 320 seconds, the mode goes on the wire`() {
        assertEquals(130L, streamReadTimeoutSeconds(ChatMode.Auto))
        assertEquals(130L, streamReadTimeoutSeconds(ChatMode.Think))
        assertEquals(320L, streamReadTimeoutSeconds(ChatMode.Deep))
        val repo = file("src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt")
        assertTrue(repo.contains(".buffer(Channel.UNLIMITED)"))
        assertTrue(repo.contains("mode = mode.wire"))
    }

    @Test fun `attachments - a PDF up to 3 000 000 bytes`() {
        assertEquals(3_000_000L, PDF_LIMIT_BYTES)
    }

    @Test fun `the ViewModel - the reply's state ends when it is built, saves run apart and one at a time, nothing routes by keyword`() {
        val vm = chat("ChatViewModel.kt")
        assertTrue(vm.contains("private val persistLock = Mutex()"))
        assertTrue(vm.contains("persistLock.withLock"))
        assertTrue(vm.indexOf("private var currentReply") in 0 until vm.indexOf("    init {"))
        assertTrue(vm.contains("if (_isAssistantResponding.value) return"))
        assertTrue(vm.contains("conversationId = null"))
        for (banned in listOf("AREA_WORDS", "askContextFor", "TravelPlaceFilter")) assertFalse(banned, vm.contains(banned))
    }

    @Test fun `sources from AI products are blocked where they enter and links open only as http or https`() {
        assertTrue(chat("ChatResponse.kt").contains("AiSourcePolicy.stripAiLinks("))
        assertTrue(file("src/main/java/com/tappyai/app/chat/data/OneBrainFrames.kt").contains("isAiProductSource"))
        assertTrue(chat("ShoppingDecisionCard.kt").contains("isOpenableLink(offer.url)"))
        assertTrue(chat("PlaceCard.kt").contains("isOpenableLink(action.url)"))
    }
}
