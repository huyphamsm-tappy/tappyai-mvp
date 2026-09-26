package com.tappyai.app.reviews.ui

import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewSourceType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The review's Android system share (2026-09-13, `ReviewShare.kt`). Before: `ACTION_SEND`
 * `text/plain` with the caption only (no canonical link, no media) — a payload that media-only
 * apps, which register `video/…` and `image/…` but never `text/plain`, can not receive. After: the
 * web's ShareModal contract (the canonical `/reviews/{id}` URL, the place as title) in
 * `EXTRA_TEXT`, and the review's own clip or photo as a `content://` stream through the app's
 * FileProvider with a temporary read grant and ClipData — the standard contract, so the RESOLVER
 * offers whichever installed apps can take it. No package names, anywhere.
 *
 * The payload helpers are pure and run for real; the intent assembly, manifest and call sites are
 * pinned by source reads (an `Intent` needs a device; the app module has no Robolectric).
 */
class ReviewShareTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private val share get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewShare.kt")

    private fun review(
        place: String = "Phở Thìn",
        body: String = "Nước dùng đậm đà",
        video: Boolean = true,
        mediaUrl: String? = "https://cdn.tappyai.com/clips/r1.mp4",
        photos: List<String>? = null,
        sourceType: ReviewSourceType? = null,
        sourceUrl: String? = null,
    ) = Review(
        id = "r1", userId = "u1", placeName = place, placeAddress = null, rating = 5, body = body,
        photos = photos, likeCount = 0, commentCount = 0, saveCount = null, createdAt = "", likedByMe = false,
        savedByMe = false, profiles = null, contentType = if (video) ReviewContentType.Video else ReviewContentType.Photo,
        mediaUrl = mediaUrl, thumbnail = null, sourceType = sourceType, sourceUrl = sourceUrl, hashtags = null,
        watchTimeAvg = null, score = null, isHidden = false, viewCount = null,
    )

    // ── the payload ──

    @Test
    fun `a native clip shares its video file, a photo post its first photo, an import or a text post nothing`() {
        val clip = shareMediaFor(review())!!
        assertEquals("https://cdn.tappyai.com/clips/r1.mp4", clip.url)
        assertEquals("video", clip.family); assertEquals("video/mp4", clip.fallbackMimeType)
        val upload = shareMediaFor(review(sourceType = ReviewSourceType.Upload))!!
        assertEquals("video", upload.family)
        val photo = shareMediaFor(review(video = false, mediaUrl = null, photos = listOf("https://cdn/p1.jpg", "https://cdn/p2.jpg")))!!
        assertEquals("https://cdn/p1.jpg", photo.url); assertEquals("image", photo.family); assertEquals("image/jpeg", photo.fallbackMimeType)
        for (imported in listOf(ReviewSourceType.YouTube, ReviewSourceType.TikTok, ReviewSourceType.Facebook)) {
            assertNull("an embed of $imported is not a file of ours", shareMediaFor(review(sourceType = imported, sourceUrl = "https://x/y")))
        }
        assertNull("a clip row without a media url", shareMediaFor(review(mediaUrl = null)))
        assertNull("a text-only post", shareMediaFor(review(video = false, mediaUrl = null, photos = emptyList())))
    }

    @Test
    fun `the text is the web's share contract - the canonical review URL, titled with the place, plus the caption`() {
        val subject = shareSubjectFor(review(), fallback = "TappyAI Review")
        assertEquals("Phở Thìn", subject)
        assertEquals("Phở Thìn\nNước dùng đậm đà\n\nhttps://tappyai.com/reviews/r1", shareTextFor(review(), "https://tappyai.com/", subject))
        assertEquals("https://tappyai.com/reviews/r1", reviewShareUrl("r1", "https://tappyai.com"))
        assertEquals("a bare share falls back to the app's title", "TappyAI Review", shareSubjectFor(review(place = "Chia sẻ"), "TappyAI Review"))
        assertEquals("TappyAI Review", shareSubjectFor(review(place = "  "), "TappyAI Review"))
        val imported = review(sourceType = ReviewSourceType.YouTube, sourceUrl = "https://youtu.be/abc", body = "")
        assertEquals("an import keeps its source link after the canonical one", "Phở Thìn\n\nhttps://tappyai.com/reviews/r1\nhttps://youtu.be/abc", shareTextFor(imported, "https://tappyai.com", "Phở Thìn"))
        assertEquals("a native clip carries no second link", "Phở Thìn\n\nhttps://tappyai.com/reviews/r1", shareTextFor(review(body = " ", sourceUrl = "https://cdn/x"), "https://tappyai.com", "Phở Thìn"))
    }

    // ── the intent: Android's own contract ──

    @Test
    fun `ACTION_SEND with the stream's MIME type, EXTRA_STREAM, ClipData and a read grant on the intent and the chooser - text plain without media`() {
        val fn = share.substring(share.indexOf("internal suspend fun shareReview("), share.indexOf("internal data class ReviewShareMedia("))
        assertTrue(fn.contains("Intent(Intent.ACTION_SEND)"))
        assertTrue(fn.contains("putExtra(Intent.EXTRA_TEXT, text)") && fn.contains("putExtra(Intent.EXTRA_SUBJECT, subject)") && fn.contains("putExtra(Intent.EXTRA_TITLE, subject)"))
        assertTrue("the declared type is the fetched media's", fn.contains("type = stream.mimeType"))
        assertTrue(fn.contains("putExtra(Intent.EXTRA_STREAM, stream.uri)"))
        assertTrue(fn.contains("clipData = ClipData.newUri(context.contentResolver, subject, stream.uri)"))
        assertEquals("the grant on the send intent AND on the chooser that launches the target", 2, Regex("""addFlags\(Intent\.FLAG_GRANT_READ_URI_PERMISSION\)""").findAll(fn).count())
        assertTrue("no media → the text form, never nothing", fn.contains("""type = "text/plain""""))
        // 2026-09-15: the chooser carries the share-history IntentSender (ShareHistoryRecorder) as its
        // third argument — the target and title are unchanged, the chooser still starts the chosen app.
        val chooser = fn.substring(fn.indexOf("Intent.createChooser("), fn.indexOf(").apply {", fn.indexOf("Intent.createChooser(")))
        assertTrue(chooser.contains("send,") && chooser.contains("context.getString(R.string.reviews_action_share)") && chooser.contains("ShareHistoryRecorder.chooserSender(context, review.id)"))
        assertTrue(fn.contains("context.startActivity(chooser)"))
        assertTrue("the media is fetched before the sheet opens, with a hint", fn.contains("val stream = media?.let { fetchForShare(context, review.id, it) }") && fn.contains("R.string.reviews_share_preparing"))
    }

    @Test
    fun `the stream is a content URI of this app's FileProvider, typed by the server within the expected family, size-capped`() {
        val fetch = share.substring(share.indexOf("private suspend fun fetchForShare("))
        assertTrue(fetch.contains("FileProvider.getUriForFile(context, context.packageName + SHARE_AUTHORITY_SUFFIX, file)"))
        assertTrue(fetch.contains("""?.takeIf { it.startsWith(media.family + "/") }""") && fetch.contains("?: media.fallbackMimeType"))
        assertTrue(fetch.contains("if (connection.contentLengthLong > MAX_SHARE_BYTES) return@runCatching null") && fetch.contains("if (total > MAX_SHARE_BYTES) {"))
        assertTrue(fetch.contains("withContext(Dispatchers.IO)") && fetch.contains("}.getOrNull()"))
        assertTrue("a partial fetch is never shared; a fresh complete file is reused", fetch.contains("if (!part.renameTo(file)) return@runCatching null") && fetch.contains("if (!file.isFile) {"))
        assertEquals(".share", SHARE_AUTHORITY_SUFFIX); assertEquals("share", SHARE_CACHE_DIR)
        val manifest = src("app/src/main/AndroidManifest.xml")
        assertTrue(manifest.contains("""android:name="androidx.core.content.FileProvider"""") && manifest.contains("""android:authorities="${'$'}{applicationId}.share""""))
        assertTrue(manifest.contains("""android:exported="false"""") && manifest.contains("""android:grantUriPermissions="true"""") && manifest.contains("""android:resource="@xml/share_paths""""))
        assertTrue(src("app/src/main/res/xml/share_paths.xml").contains("""<cache-path name="share" path="share/" />"""))
        for (rel in listOf("app/src/main/res/values/strings_reviews.xml", "app/src/main/res/values-vi/strings_reviews.xml")) assertTrue(src(rel).contains("""name="reviews_share_preparing""""))
    }

    @Test
    fun `no package-specific hacks - no package names, no setPackage, no per-app buttons`() {
        val ui = File(generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "app/src/main/java/com/tappyai/app/reviews/ui").isDirectory }, "app/src/main/java/com/tappyai/app/reviews/ui")
        val all = ui.listFiles()!!.filter { it.extension == "kt" }.joinToString("\n") { it.readText() }
        for (needle in listOf("setPackage(", "com.facebook", "com.zhiliaoapp", "com.ss.android", "com.zing.zalo", "jp.naver.line", "com.viber", "EXTRA_EXCLUDE_COMPONENTS", "EXTRA_INITIAL_INTENTS", "LabeledIntent", "queryIntentActivities")) {
            assertFalse(needle, all.contains(needle))
        }
        // The manifest DOES declare <queries><package> entries — for the V3 TappyShareSheet's
        // platform buttons (Messenger / Zalo / WhatsApp / Telegram …), which need package
        // visibility on Android 11+. ReviewShare itself stays package-agnostic; the assertions
        // above pin that on its own source.
    }

    @Test
    fun `both share entry points launch the same helper, and the old text-only one is gone`() {
        assertTrue(src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewClipPager.kt").contains("onShare = { shareScope.launch { shareReview(context, review) } },"))
        val screens = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        assertTrue(screens.contains("onShare = { shareScope.launch { shareReview(context, review) } },"))
        assertFalse(screens.contains("fun shareReview(") || screens.contains("ACTION_SEND"))
        assertEquals("one definition", 1, Regex("""fun shareReview\(""").findAll(share).count())
    }
}
