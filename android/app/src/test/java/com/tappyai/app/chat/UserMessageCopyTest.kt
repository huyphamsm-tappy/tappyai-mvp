package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Review 01/11 (Android = the web): the web has a copy button under every question the person sent (UserMessageCopy.tsx), copying the text exactly
 * as typed. Android's MessageActionBar was for answers only, so a sent question could not be copied.
 */
class UserMessageCopyTest {
    private fun repo(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "docs/uat/evidence").isDirectory }

    @Test
    fun `a question is copied exactly as typed - marks, links and line breaks untouched`() {
        val typed = "so sánh **A** và *B*\nxem https://example.com/x?a=1 giúp mình"
        assertEquals(typed, userCopyText(typed))
    }

    @Test
    fun `an empty or blank question has nothing to copy`() {
        assertNull(userCopyText(""))
        assertNull(userCopyText("  \n "))
    }

    @Test
    fun `the chat shows the copy button under every question the person sent`() {
        val screen = File(repo(), "android/app/src/main/java/com/tappyai/app/chat/ChatScreen.kt").readText()
        assertTrue(screen.contains("UserMessageCopyButton(message.text)"))
    }
}
