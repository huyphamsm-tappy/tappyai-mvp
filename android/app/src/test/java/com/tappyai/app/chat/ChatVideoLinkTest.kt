package com.tappyai.app.chat

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** fbcdn / tiktokcdn serve clips too: a clip link must stay a link, not become a broken image. */
class ChatVideoLinkTest {
    @Test fun `a tiktokcdn or fbcdn clip is not an image`() {
        assertFalse(ChatResponseParser.isImageUrl("https://v16-webapp.tiktokcdn.com/abc/video/tos/xyz.mp4?x=1"))
        assertFalse(ChatResponseParser.isImageUrl("https://video.xx.fbcdn.net/v/t42/clip.mp4"))
        assertFalse(ChatResponseParser.isImageUrl("https://p16-sign.tiktokcdn.com/obj/x?mime_type=video_mp4"))
    }

    @Test fun `photos on the same hosts still are`() {
        assertTrue(ChatResponseParser.isImageUrl("https://scontent.xx.fbcdn.net/v/t39/photo.jpg"))
        assertTrue(ChatResponseParser.isImageUrl("https://p16-sign.tiktokcdn.com/tos-maliva-p-0068/cover~tplv.webp"))
        assertTrue(ChatResponseParser.isImageUrl("https://lh3.googleusercontent.com/p/AF1Qip"))
    }

    @Test fun `a clip link survives normalisation as a link`() {
        val md = "[Xem clip](https://v16-webapp.tiktokcdn.com/abc/video/tos/xyz.mp4)"
        assertTrue(ChatResponseParser.normalizeImageLinks(md) == md)
    }
}
