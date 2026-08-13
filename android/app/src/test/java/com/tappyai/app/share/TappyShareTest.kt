package com.tappyai.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Android must offer the same share targets, and enforce the same URL guard, as
 * the web client. A share URL is the one thing a user deliberately hands to a
 * third party, so a token, an internal API path or a storage object URL must
 * never be able to ride along.
 */
class TappyShareTest {

    private val review = "https://www.tappyai.com/reviews/af7dfbea-b41f-41e3-853c-9a5403ca1f3d"

    @Test
    fun `offers the same targets in the same order as web`() {
        assertEquals(
            listOf("facebook", "tiktok", "zalo", "copy", "native"),
            TappyShare.targets.map { it.id }
        )
    }

    @Test
    fun `facebook receives the canonical url encoded`() {
        val out = TappyShare.buildShareUrl(TappyShare.Target.FACEBOOK, review)
        assertTrue(out!!.startsWith("https://www.facebook.com/sharer/sharer.php?u="))
        assertTrue(out.contains("tappyai.com"))
    }

    @Test
    fun `zalo receives the canonical url encoded`() {
        val out = TappyShare.buildShareUrl(TappyShare.Target.ZALO, review)
        assertTrue(out!!.contains("zalo.me"))
    }

    /** No public web endpoint exists; saying so is the feature. */
    @Test
    fun `tiktok has no url handoff`() {
        assertNull(TappyShare.buildShareUrl(TappyShare.Target.TIKTOK, review))
    }

    @Test
    fun `copy and native are not url handoffs`() {
        assertNull(TappyShare.buildShareUrl(TappyShare.Target.COPY, review))
        assertNull(TappyShare.buildShareUrl(TappyShare.Target.NATIVE, review))
    }

    @Test
    fun `accepts canonical public pages`() {
        assertTrue(TappyShare.isShareableUrl(review))
        assertTrue(TappyShare.isShareableUrl("https://tappyai.com/reviews/x"))
    }

    @Test
    fun `rejects every leak class`() {
        val bad = listOf(
            "https://y5ozy0i9wdb73mam.public.blob.vercel-storage.com/videos/1.mp4",
            "https://storage.googleapis.com/tappyai-media-prod/videos/u/a.mp4",
            "https://www.tappyai.com/api/reviews/feed",
            "https://www.tappyai.com/reviews/x?token=secret",
            "https://tappyai-mvp-abc.vercel.app/reviews/x",
            "https://www.tappyai.com.evil.test/x",
            "http://www.tappyai.com/x",
            "",
        )
        for (url in bad) {
            assertFalse("should reject $url", TappyShare.isShareableUrl(url))
            assertNull(TappyShare.buildShareUrl(TappyShare.Target.FACEBOOK, url))
        }
    }

    /** A conversation is authenticated; a shared link would only show a login page. */
    @Test
    fun `private chat is not shareable`() {
        val chat = "https://www.tappyai.com/chat/6164ff68-eae6-49da-abe7-525fbccf2827"
        assertFalse(TappyShare.isShareableUrl(chat))
        assertNull(TappyShare.buildShareUrl(TappyShare.Target.ZALO, chat))
    }

    @Test
    fun `review url is canonical`() {
        assertEquals("https://www.tappyai.com/reviews/abc", TappyShare.reviewUrl("abc"))
        assertTrue(TappyShare.isShareableUrl(TappyShare.reviewUrl("abc")))
    }
}
