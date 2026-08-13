package com.tappyai.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What each share target actually *does* on Android.
 *
 * `TappyShare` answers "what URL, if any, hands this link to that network". It deliberately returns
 * null for TikTok, copy and native — but null is not an instruction, and the UI still has to do
 * something. That decision lives here, as plain Kotlin, so it can be asserted without an emulator:
 * Compose only performs the resulting action.
 *
 * TikTok has no public web handoff, so its action is the Android system chooser with the canonical
 * URL. If TikTok is installed the OS may offer it — that is the OS's doing, not a TappyAI post.
 */
class ShareActionsTest {

    private val canonical = TappyShare.reviewUrl("abc123")

    @Test
    fun `facebook opens the sharer handoff`() {
        val action = TappyShareActions.actionFor(TappyShare.Target.FACEBOOK, canonical)
        assertTrue("expected a URL handoff, got $action", action is ShareAction.OpenUrl)
        val url = (action as ShareAction.OpenUrl).url
        assertTrue("facebook sharer expected: $url", url.startsWith("https://www.facebook.com/sharer/sharer.php?u="))
        assertTrue("the canonical review URL must be the payload: $url", url.contains("tappyai.com"))
        assertTrue("the review id must survive encoding: $url", url.contains("abc123"))
    }

    @Test
    fun `zalo opens the plugin handoff`() {
        val action = TappyShareActions.actionFor(TappyShare.Target.ZALO, canonical)
        assertTrue("expected a URL handoff, got $action", action is ShareAction.OpenUrl)
        val url = (action as ShareAction.OpenUrl).url
        assertTrue("zalo share plugin expected: $url", url.startsWith("https://sp.zalo.me/plugins/share?url="))
        assertTrue("the review id must survive encoding: $url", url.contains("abc123"))
    }

    // The whole point of the TikTok decision: native, not a fabricated endpoint.
    @Test
    fun `tiktok uses the android system chooser, not an invented URL`() {
        val action = TappyShareActions.actionFor(TappyShare.Target.TIKTOK, canonical)
        assertEquals(ShareAction.SystemShare(canonical), action)
    }

    @Test
    fun `native uses the android system chooser`() {
        val action = TappyShareActions.actionFor(TappyShare.Target.NATIVE, canonical)
        assertEquals(ShareAction.SystemShare(canonical), action)
    }

    @Test
    fun `copy copies the canonical URL and nothing else`() {
        val action = TappyShareActions.actionFor(TappyShare.Target.COPY, canonical)
        assertEquals(ShareAction.CopyLink(canonical), action)
    }

    @Test
    fun `every target carries exactly the canonical review URL`() {
        for (target in TappyShare.targets) {
            val payload = when (val action = TappyShareActions.actionFor(target, canonical)) {
                is ShareAction.OpenUrl -> action.url
                is ShareAction.SystemShare -> action.text
                is ShareAction.CopyLink -> action.url
                ShareAction.Unsupported -> ""
            }
            assertTrue("$target dropped the canonical URL: $payload", payload.contains("abc123"))
            assertTrue("$target must not leak an api route: $payload", !payload.contains("/api"))
            assertTrue("$target must not leak a Blob URL: $payload", !payload.contains("blob.vercel-storage.com"))
            assertTrue("$target must not leak a GCS object: $payload", !payload.contains("storage.googleapis.com"))
        }
    }

    // A URL the guard refuses must produce no action at all, on every target. Otherwise the guard is
    // decorative: the sheet would happily hand a private or internal URL to another app.
    @Test
    fun `an unshareable URL yields no action on any target`() {
        val refused = listOf(
            "https://www.tappyai.com/chat/abc",
            "https://www.tappyai.com/api/reviews/abc",
            "https://www.tappyai.com/admin",
            "https://www.tappyai.com/reviews/abc?token=secret",
            "https://tappyai-xyz.vercel.app/reviews/abc",
            "https://tappy.public.blob.vercel-storage.com/reviews/abc.mp4",
            "https://storage.googleapis.com/tappyai-media/reviews/abc.mp4",
            "http://www.tappyai.com/reviews/abc",
        )
        for (url in refused) {
            for (target in TappyShare.targets) {
                assertEquals(
                    "$target must refuse $url",
                    ShareAction.Unsupported,
                    TappyShareActions.actionFor(target, url),
                )
            }
        }
    }
}
