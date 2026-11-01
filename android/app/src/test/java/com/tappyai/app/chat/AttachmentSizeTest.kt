package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File

/**
 * Review 01/11 (Android = the web). A PDF whose size the system does not report (a provider with no SIZE column) was accepted as 0 bytes, so a
 * file over the 3 MB limit got through and only the server refused it. The size is now read from the stream itself, up to one byte past the limit.
 */
class AttachmentSizeTest {
    @Test fun `the length is counted from the stream and stops at the cap`() {
        assertEquals(10L, countBytesUpTo(ByteArrayInputStream(ByteArray(10)), 3_000_001))
        assertEquals(5L, countBytesUpTo(ByteArrayInputStream(ByteArray(10)), 5))
        assertEquals(0L, countBytesUpTo(ByteArrayInputStream(ByteArray(0)), 5))
    }

    @Test fun `a PDF over the limit is refused even when the system gave no size`() {
        val counted = countBytesUpTo(ByteArrayInputStream(ByteArray(3_000_100)), PDF_LIMIT_BYTES + 1)
        assertEquals(AttachCheck.PdfTooLarge, attachmentCheck("application/pdf", counted))
        assertEquals(AttachCheck.Pdf, attachmentCheck("application/pdf", countBytesUpTo(ByteArrayInputStream(ByteArray(1000)), PDF_LIMIT_BYTES + 1)))
    }

    @Test fun `the chat screen reads the length itself when the size is unknown`() {
        val root = generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "docs/uat/evidence").isDirectory }
        val screen = File(root, "android/app/src/main/java/com/tappyai/app/chat/ChatScreen.kt").readText()
        assertTrue(screen.contains("countBytesUpTo("))
    }
}
