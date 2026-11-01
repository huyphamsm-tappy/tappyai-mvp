package com.tappyai.app.chat.data

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The reply stream is read on IO and drawn on Main. callbackFlow's default buffer holds 64 events and `trySend` DROPS the rest when it is
 * full: a burst of frames (a long Deep Research report) while Main re-reads the text lost words (`0:`), research cards, charts and places
 * (`8:`) or the "cut" notice. Nothing in the stream may be dropped, so the buffer is unlimited (Main always catches up; the stream is a few
 * hundred kilobytes at most).
 */
class ChatStreamBufferTest {
    @Test fun `the reply stream never drops an event`() {
        val src = File("src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        assertTrue(src.contains(".buffer(Channel.UNLIMITED)"))
    }
}
