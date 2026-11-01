package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Review of 02/11 (Android, before the freeze): the ViewModel's turn state. The app has no Robolectric, so these pin the shape of
 * the code that each bug lived in; every one was red against the code before its fix.
 */
class ChatViewModelTurnStateTest {
    private fun src(p: String) = File("src/main/java/com/tappyai/app/chat/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()
    private val vm = src("ChatViewModel.kt")

    // Saving is a network call (up to 30 s on a weak line). Inside the turn's job it kept the Stop button, the locked input and a second
    // copy of the reply (live bubble + built message) on screen, Stop cancelled the save half way, and the cancelled job's finally could
    // clear the NEXT turn's state. The reply is final once built: the live state goes at once and the save runs on its own, one at a time.
    @Test fun `the live state ends when the reply is built and the save runs apart, one at a time`() {
        val calls = Regex("""persistConversation\(\)""").findAll(vm).count()
        val launched = Regex("""viewModelScope\.launch \{ persistConversation\(\) \}""").findAll(vm).count()
        assertEquals("every save but the definition runs in its own launch", calls, launched + 1)
        assertTrue("saves are serialized", vm.contains("persistLock.withLock"))
        val built = vm.indexOf("val finalReply")
        val save = vm.indexOf("viewModelScope.launch { persistConversation() }", built)
        assertTrue(built > 0 && save > built)
        assertTrue("the live state is cleared before the save starts", vm.substring(built, save).contains("_isAssistantResponding.value = false"))
    }

    // viewModelScope runs on Main.immediate, so a turn started from init (a prefilled question) assigns currentReply BEFORE the property
    // initializers that follow init run; a declaration below init then resets it to null and Stop keeps nothing.
    @Test fun `the partial-reply holders are declared before init so a prefilled turn keeps them`() {
        val init = vm.indexOf("    init {")
        assertTrue(init > 0)
        for (holder in listOf("private var currentReply: StringBuilder?", "private var currentAnnotations: TurnAnnotations?")) {
            val at = vm.indexOf(holder)
            assertTrue("$holder must be declared", at > 0)
            assertTrue("$holder is declared after init", at < init)
            assertEquals("declared once", at, vm.lastIndexOf(holder))
        }
    }
}
