package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** UAT 2026-09-28 (owner P1c), web parity with formatMessage: a photo written as a link is a photo. */
class ChatLinkNormalizeTest {
    @Test fun photoWrittenAsLinkBecomesImage() {
        val out = ChatResponseParser.normalizeImageLinks("[Ảnh địa điểm](https://lh3.googleusercontent.com/p/AF1Qip=w408)")
        assertEquals("![Ảnh địa điểm](https://lh3.googleusercontent.com/p/AF1Qip=w408)", out)
    }

    @Test fun bareImageUrlBecomesImage() {
        val out = ChatResponseParser.normalizeImageLinks("xem https://encrypted-tbn0.gstatic.com/images?q=tbn:abc")
        assertEquals("xem ![](https://encrypted-tbn0.gstatic.com/images?q=tbn:abc)", out)
    }

    @Test fun pageLinksStayLinks() {
        val md = "[Google Maps](https://maps.google.com/?cid=1) https://www.facebook.com/x"
        assertEquals(md, ChatResponseParser.normalizeImageLinks(md))
        assertFalse(ChatResponseParser.isImageUrl("https://maps.google.com/?cid=1"))
        assertTrue(ChatResponseParser.isImageUrl("https://example.com/a.jpg"))
    }

    @Test fun parsedPhotoLinkLeavesNoTextLink() {
        val parsed = ChatResponseParser.parse("Quán ngon.\n[Ảnh địa điểm](https://lh3.googleusercontent.com/p/AF1Qip=w408)")
        val texts = parsed.segments.filterIsInstance<ReplySegment.Text>().joinToString(" ") { it.markdown }
        val images = parsed.segments.filterIsInstance<ReplySegment.Images>().flatMap { it.urls }
        assertFalse(texts.contains("Ảnh địa điểm"))
        assertEquals(listOf("https://lh3.googleusercontent.com/p/AF1Qip=w408"), images)
    }
}
