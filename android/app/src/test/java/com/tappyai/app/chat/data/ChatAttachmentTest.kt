package com.tappyai.app.chat.data

import com.tappyai.app.chat.AttachCheck
import com.tappyai.app.chat.ChatMessage
import com.tappyai.app.chat.attachmentCheck
import com.tappyai.core.designsystem.component.TappyChatRole
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 02/11 (owner: Android follows the web's one-brain chat): the composer's "+" attaches a photo or a PDF, as on the web
 * (ChatInterface.tsx handleImageSelect + the "+" menu's «Thêm ảnh & tệp PDF»; the server: clientInput.ts validateAttachment).
 *  - images PNG / JPG / WEBP / GIF; a PDF up to 3 MB; anything else is refused before sending, with the web's words;
 *  - a PDF goes as the web sends it: `experimental_attachments: [{ url: data:application/pdf;base64,…, contentType, name }]`
 *    (the server reads its text); a photo keeps the vision part this app already sends;
 *  - an earlier turn's PDF is not sent again either - the history names it.
 */
class ChatAttachmentTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test fun `the web's limits - four image types and a PDF up to 3 MB`() {
        for (m in listOf("image/png", "image/jpeg", "image/webp", "image/gif")) assertEquals(m, AttachCheck.Image, attachmentCheck(m, 9_000_000))
        assertEquals(AttachCheck.Pdf, attachmentCheck("application/pdf", 3_000_000))
        assertEquals(AttachCheck.PdfTooLarge, attachmentCheck("application/pdf", 3_000_001))
        assertEquals(AttachCheck.Unsupported, attachmentCheck("image/heic", 10))
        assertEquals(AttachCheck.Unsupported, attachmentCheck("application/zip", 10))
        assertEquals(AttachCheck.Unsupported, attachmentCheck(null, 10))
    }

    @Test fun `a PDF goes as experimental_attachments with the text as content`() {
        val dto = ChatMessageDto(role = "user", content = textContent("Tóm tắt giúp mình"), experimental_attachments = listOf(pdfAttachment("data:application/pdf;base64,JVBERi0=", "Hợp đồng.pdf")))
        val body = json.encodeToString(ChatMessageDto.serializer(), dto)
        assertEquals("""{"role":"user","content":"Tóm tắt giúp mình","experimental_attachments":[{"url":"data:application/pdf;base64,JVBERi0=","contentType":"application/pdf","name":"Hợp đồng.pdf"}]}""", body)
        // a turn without one carries no such field (encodeDefaults=false)
        assertFalse("experimental_attachments" in json.encodeToString(ChatMessageDto.serializer(), ChatMessageDto("user", textContent("x"))))
    }

    @Test fun `an earlier PDF is named in the history, not sent again`() {
        val msgs = listOf(
            ChatMessage(1, TappyChatRole.User, "Đọc giúp", attachmentMime = "application/pdf", attachmentName = "Hợp đồng.pdf"),
            ChatMessage(2, TappyChatRole.Assistant, "Đã đọc."),
            ChatMessage(3, TappyChatRole.User, "Điều 5 nói gì?"),
        )
        val out = compactHistory(msgs) { it.attachmentMime != null }
        assertEquals("Đọc giúp\n[Attached with this message: Hợp đồng.pdf]", out[0].text)
        assertEquals(null, out[0].attachmentMime)
    }

    @Test fun `the menu offers attaching first, and the repository sends a PDF as an attachment`() {
        fun src(p: String) = File("src/main/java/com/tappyai/app/chat/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        assertTrue(src("ChatModeMenu.kt").contains("R.string.chat_attach"))
        assertTrue(src("data/RealChatRepository.kt").contains("experimental_attachments = listOf(pdfAttachment("))
        for (f in listOf("values/strings_chat.xml", "values-vi/strings_chat.xml")) {
            val xml = File("src/main/res/$f").let { if (it.exists()) it else File("app/" + it.path) }.readText()
            for (k in listOf("chat_attach", "chat_attach_hint", "chat_attach_unsupported", "chat_attach_pdf_too_large")) assertTrue("$f $k", "name=\"$k\"" in xml)
        }
    }
}
