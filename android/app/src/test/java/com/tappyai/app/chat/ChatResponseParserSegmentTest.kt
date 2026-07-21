package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the positional rendering contract for assistant replies (canonical architecture: each
 * recommendation renders as one complete block — name/rating/photos/description/links — before the
 * next; photos are NEVER collected and appended after the whole text).
 *
 * REGRESSION (permanent): the original parser extracted every `![..](..)` into one flat
 * `imageUrls` list and the screen appended a single carousel after the full text — text-first,
 * images-last, breaking the web's storytelling flow. These tests fail on any parser that loses the
 * image positions.
 */
class ChatResponseParserSegmentTest {

    @Test
    fun `segments interleave text and galleries in stream order`() {
        val reply = """
            **Quán A** 4.9⭐
            ![a1](https://img.example/a1.jpg)
            ![a2](https://img.example/a2.jpg)
            Mô tả quán A.
            **Quán B** 4.7⭐
            ![b1](https://img.example/b1.jpg)
            Mô tả quán B.
        """.trimIndent()

        val segments = ChatResponseParser.parse(reply).segments

        assertEquals(
            listOf(
                ReplySegment.Text("**Quán A** 4.9⭐"),
                ReplySegment.Images(listOf("https://img.example/a1.jpg", "https://img.example/a2.jpg")),
                ReplySegment.Text("Mô tả quán A.\n**Quán B** 4.7⭐"),
                ReplySegment.Images(listOf("https://img.example/b1.jpg")),
                ReplySegment.Text("Mô tả quán B."),
            ),
            segments,
        )
    }

    /** A run of consecutive image lines is ONE gallery (web formatMessage groups them). */
    @Test
    fun `consecutive images group into a single gallery segment`() {
        val segments = ChatResponseParser.parse(
            "![1](https://x/1.jpg)\n![2](https://x/2.jpg)\n![3](https://x/3.jpg)",
        ).segments

        assertEquals(
            listOf(ReplySegment.Images(listOf("https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg"))),
            segments,
        )
    }

    /** The clean [ParsedAssistantReply.text] (copy/TTS/persistence) still strips images. */
    @Test
    fun `clean text keeps its image-stripped shape`() {
        val parsed = ChatResponseParser.parse("Trước\n![a](https://x/a.jpg)\nSau")
        assertEquals("Trước\n\nSau", parsed.text)
    }

    @Test
    fun `trimPartialImage hides a half-arrived trailing image but keeps complete ones`() {
        assertEquals("Văn bản", ChatResponseParser.trimPartialImage("Văn bản\n![đang tải"))
        assertEquals("Văn bản", ChatResponseParser.trimPartialImage("Văn bản\n![alt](https://x/par"))
        assertEquals(
            "Văn bản ![xong](https://x/a.jpg)",
            ChatResponseParser.trimPartialImage("Văn bản ![xong](https://x/a.jpg)"),
        )
    }

    /** Structured markers still strip before segmentation — no marker ever reaches a segment. */
    @Test
    fun `segments never contain structured markers`() {
        val parsed = ChatResponseParser.parse(
            "Gợi ý đây\n![a](https://x/a.jpg)\n[CTA_BUTTONS]{\"buttons\":[]}[/CTA_BUTTONS]",
        )
        assertEquals(
            listOf(
                ReplySegment.Text("Gợi ý đây"),
                ReplySegment.Images(listOf("https://x/a.jpg")),
            ),
            parsed.segments,
        )
    }
}
