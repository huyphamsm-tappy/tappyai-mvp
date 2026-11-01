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
