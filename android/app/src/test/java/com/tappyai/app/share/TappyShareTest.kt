package com.tappyai.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

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
            listOf("facebook", "zalo", "viber", "line", "tiktok", "email", "inbox", "save", "copy", "native"),
            TappyShare.targets.map { it.id }
        )
    }

    /** Direct handoff is a claim about specific apps; every claimed package must be queryable. */
    @Test
    fun `direct app packages are exactly the manifest queries`() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        val declared = Regex("""<package android:name="([^"]+)"""").findAll(manifest).map { it.groupValues[1] }.toList()
        assertEquals(TappyShare.queriedPackages.sorted(), declared.sorted())
        val mapped = TappyShare.targets.mapNotNull { TappyShare.packageFor(it) }
        assertEquals(TappyShare.queriedPackages.sorted(), mapped.sorted())
    }

    @Test
    fun `only messaging apps have a package`() {
        assertEquals("com.zing.zalo", TappyShare.packageFor(TappyShare.Target.ZALO))
        assertEquals("com.viber.voip", TappyShare.packageFor(TappyShare.Target.VIBER))
        assertEquals("com.facebook.orca", TappyShare.packageFor(TappyShare.Target.FACEBOOK))
        assertEquals("jp.naver.line.android", TappyShare.packageFor(TappyShare.Target.LINE))
        for (t in listOf(TappyShare.Target.TIKTOK, TappyShare.Target.EMAIL, TappyShare.Target.INBOX,
            TappyShare.Target.SAVE, TappyShare.Target.COPY, TappyShare.Target.NATIVE)) {
            assertNull(t.id, TappyShare.packageFor(t))
        }
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
    fun `non url targets are not url handoffs`() {
        for (t in listOf(TappyShare.Target.VIBER, TappyShare.Target.LINE, TappyShare.Target.EMAIL,
            TappyShare.Target.INBOX, TappyShare.Target.SAVE, TappyShare.Target.COPY, TappyShare.Target.NATIVE)) {
            assertNull(t.id, TappyShare.buildShareUrl(t, review))
        }
    }

    @Test
    fun `text handoff carries the brochure, encoded, for email viber and line only`() {
        val text = "TappyAI gợi ý: bún bò\n\n1. Quán A\n   📍 12 Lê Lợi\n\nGợi ý bởi TappyAI · www.tappyai.com"
        val mail = TappyShare.buildTextShareUrl(TappyShare.Target.EMAIL, "TappyAI gợi ý", text)!!
        assertTrue(mail.startsWith("mailto:?subject="))
        assertTrue(mail.contains("&body="))
        assertFalse(mail.contains("+"))
        assertTrue(mail.contains("%0A"))
        val viber = TappyShare.buildTextShareUrl(TappyShare.Target.VIBER, "s", text)!!
        assertTrue(viber.startsWith("viber://forward?text="))
        val line = TappyShare.buildTextShareUrl(TappyShare.Target.LINE, "s", text)!!
        assertTrue(line.startsWith("https://line.me/R/share?text="))
        assertEquals(text, java.net.URLDecoder.decode(line.removePrefix("https://line.me/R/share?text="), "UTF-8"))
        for (t in listOf(TappyShare.Target.FACEBOOK, TappyShare.Target.ZALO, TappyShare.Target.TIKTOK,
            TappyShare.Target.INBOX, TappyShare.Target.SAVE, TappyShare.Target.COPY, TappyShare.Target.NATIVE)) {
            assertNull(t.id, TappyShare.buildTextShareUrl(t, "s", text))
        }
        assertNull(TappyShare.buildTextShareUrl(TappyShare.Target.EMAIL, "s", "   "))
    }

    @Test
    fun `accepts canonical public pages`() {
        assertTrue(TappyShare.isShareableUrl(review))
        assertTrue(TappyShare.isShareableUrl("https://tappyai.com/reviews/x"))
        assertTrue(TappyShare.isShareableUrl(TappyShare.CANONICAL_ORIGIN))
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

    /** The Inbox URL is the web Messenger — a canonical page, not an API or a chat. */
    @Test
    fun `inbox url is a shareable canonical page`() {
        assertTrue(TappyShare.INBOX_URL.startsWith("https://www.tappyai.com/"))
        assertFalse(TappyShare.INBOX_URL.contains("/api/"))
    }
}
