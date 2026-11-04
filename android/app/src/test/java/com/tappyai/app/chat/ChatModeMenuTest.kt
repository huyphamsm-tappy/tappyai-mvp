package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A2 (02/11): the composer's mode menu, as on the web (ChatInterface.tsx "+" menu): picking a mode turns it on, picking the mode in use
 * turns it off (back to Auto); a chip shows the mode in use and its ✕ goes back to Auto; Deep Research is for one question (the web goes
 * back to Auto once the request is sent).
 */
class ChatModeMenuTest {

    @Test fun `picking a mode turns it on, picking it again goes back to Auto`() {
        assertEquals(ChatMode.Think, ChatMode.Auto.picked(ChatMode.Think))
        assertEquals(ChatMode.Web, ChatMode.Think.picked(ChatMode.Web))
        assertEquals(ChatMode.Auto, ChatMode.Think.picked(ChatMode.Think))
    }

    // Owner 01/11: people just type and Auto picks quick answer / web lookup / thinking itself, so the menu keeps only Deep Research
    // (besides attaching). Chat, Web and Think remain modes the server reads, not menu items.
    @Test fun `the menu offers only Deep Research after attaching`() {
        assertEquals(listOf(ChatMode.Deep), ChatMode.menu)
    }

    @Test fun `Deep Research is for one question, every other mode stays`() {
        assertEquals(ChatMode.Auto, ChatMode.Deep.afterSend())
        for (m in ChatMode.entries.filter { it != ChatMode.Deep }) assertEquals(m, m.afterSend())
    }

    @Test fun `every mode has its label and hint in both languages`() {
        fun res(p: String) = File("src/main/res/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        for (file in listOf("values/strings_chat.xml", "values-vi/strings_chat.xml")) {
            val xml = res(file)
            for (m in ChatMode.menu) {
                assertTrue("$file ${m.wire}", "name=\"chat_mode_${m.wire}\"" in xml)
                assertTrue("$file ${m.wire} hint", "name=\"chat_mode_${m.wire}_hint\"" in xml)
            }
            assertTrue(file, "name=\"chat_mode_menu\"" in xml)
            assertTrue(file, "name=\"chat_mode_off\"" in xml)
        }
    }

    @Test fun `the screen shows the menu and the chip, and the ViewModel applies the rules`() {
        fun src(p: String) = File("src/main/java/com/tappyai/app/chat/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        val screen = src("ChatScreen.kt")
        assertTrue(screen.contains("ChatModeMenuButton("))
        assertTrue(screen.contains("ChatModeChip("))
        val vm = src("ChatViewModel.kt")
        assertTrue(vm.contains("_mode.value = _mode.value.picked(mode)"))
        assertTrue(vm.contains("_mode.value = turnMode.afterSend()"))
    }
}
