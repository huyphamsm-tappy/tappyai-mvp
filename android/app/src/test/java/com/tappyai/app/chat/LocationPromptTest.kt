package com.tappyai.app.chat

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * UAT3 (2026-09-27, Galaxy A12): the location prompt came back on every place turn after
 * "Không cho phép", and a message typed while the dialog was up never reached the composer.
 */
class LocationPromptTest {

    @Test
    fun `a send asks once, then never again - whatever the answer was`() {
        assertTrue(LocationPrompt.shouldAsk(hasPermission = false, explicit = false, askedBefore = false))
        assertFalse(LocationPrompt.shouldAsk(hasPermission = false, explicit = false, askedBefore = true))
        // Five place turns after one refusal: none of them asks.
        repeat(5) { assertFalse(LocationPrompt.shouldAsk(hasPermission = false, explicit = false, askedBefore = true)) }
    }

    @Test
    fun `the nearby chip may ask again, and nobody asks once it is granted`() {
        assertTrue(LocationPrompt.shouldAsk(hasPermission = false, explicit = true, askedBefore = true))
        assertFalse(LocationPrompt.shouldAsk(hasPermission = true, explicit = true, askedBefore = false))
        assertFalse(LocationPrompt.shouldAsk(hasPermission = true, explicit = false, askedBefore = false))
    }

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }

    @Test
    fun `the send waits for the dialog instead of racing it - the composer keeps its text`() {
        val screen = File(root(), "app/src/main/java/com/tappyai/app/chat/ChatScreen.kt").readText()
        // The composer's send goes through the prompt gate, and the gate runs the send from the
        // launcher callback when it had to ask (never "ask, then send immediately").
        assertTrue(screen.contains("onSend = { withLocationPrompt(false) { viewModel.onSend() } },"))
        assertTrue(screen.contains("afterLocationPrompt = action"))
        assertTrue(screen.contains("action?.invoke()"))
        assertFalse("the old ask-then-send-now path is gone", screen.contains("askLocationOnce(); viewModel.onSend()"))
        // The prompt is remembered per install, not per call.
        assertTrue(screen.contains("LocationPrompt.markAsked(context)"))
    }
}
