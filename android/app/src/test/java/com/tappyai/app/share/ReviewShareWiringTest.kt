package com.tappyai.app.share

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The share sheet has to be *reachable*.
 *
 * `ReviewShareSheet.kt` existed for a long time as dead code: nothing called it, and both review
 * screens fired a raw ACTION_SEND with the review's text instead — so an Android share never carried
 * a TappyAI link at all, and the Open Graph preview work could never apply to it. Unit-testing the
 * action logic would not have caught that; only the wiring does.
 *
 * These are source assertions because instrumenting Compose needs a device, and there is none here.
 * They are narrow on purpose: each one fails for exactly one regression.
 */
class ReviewShareWiringTest {

    private fun appDir(): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "app/src/main/java/com/tappyai/app/share/TappyShare.kt")
            if (candidate.isFile) return File(dir, "app")
            dir = dir.parentFile
        }
        throw AssertionError("android/app not found — did the module move?")
    }

    private fun source(relative: String): String {
        val file = File(appDir(), relative)
        assertTrue("missing $relative — the guard would be vacuous", file.isFile)
        return file.readText()
    }

    private val screens by lazy { source("src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt") }
    private val host by lazy { source("src/main/java/com/tappyai/app/reviews/ui/ReviewShareHost.kt") }
    private val sheet by lazy { source("src/main/java/com/tappyai/app/reviews/ui/ReviewShareSheet.kt") }
    private val stringsEn by lazy { source("src/main/res/values/strings_reviews.xml") }
    private val stringsVi by lazy { source("src/main/res/values-vi/strings_reviews.xml") }

    /** Only the share strings — the rest of the file is about posting reviews, a different verb. */
    private fun shareStrings(xml: String): String =
        Regex("<string name=\"reviews_share[^\"]*\">[^<]*</string>")
            .findAll(xml)
            .joinToString("\n") { it.value }

    // The chain has to hold end to end: a screen that opens the host, a host that renders the sheet.
    // Asserting only one link is how the sheet became dead code in the first place.
    @Test
    fun `the review screens actually present the share sheet`() {
        assertTrue(
            "ReviewsScreens must mount ReviewShareHost — otherwise the sheet is dead code again",
            screens.contains("ReviewShareHost("),
        )
        assertTrue(
            "ReviewShareHost must render ReviewShareSheet",
            host.contains("ReviewShareSheet("),
        )
    }

    @Test
    fun `both review surfaces open it`() {
        // The feed pager and the review detail. Wiring only one leaves half the app on the old path.
        val opens = Regex("onShare\\s*=").findAll(screens).count()
        assertTrue("expected both review surfaces to wire onShare, found $opens", opens >= 2)
        assertTrue(
            "onShare must open the sheet, not fire a chooser directly",
            !screens.contains("onShare = { shareReview("),
        )
    }

    @Test
    fun `the canonical URL comes from TappyShare and is not rebuilt by hand`() {
        assertTrue("expected TappyShare.reviewUrl", host.contains("TappyShare.reviewUrl("))
        for ((name, src) in listOf("screens" to screens, "host" to host, "sheet" to sheet)) {
            assertTrue(
                "the origin must not be re-declared in $name",
                !src.contains("https://www.tappyai.com") && !src.contains("tappyai.com/reviews"),
            )
        }
    }

    @Test
    fun `the old text-sharing path is gone`() {
        // It shared placeName + body + sourceUrl, so a shared review carried no TappyAI URL.
        assertTrue(
            "shareReview(context, review) must no longer be the share path",
            !screens.contains("private fun shareReview("),
        )
    }

    @Test
    fun `the sheet renders every declared target`() {
        for (target in TappyShare.targets) {
            assertTrue(
                "the sheet must render ${target.id}",
                sheet.contains(target.name) || sheet.contains("TappyShare.targets"),
            )
        }
        assertTrue("the sheet must drive itself from the contract", sheet.contains("TappyShare.targets"))
    }

    @Test
    fun `the sheet performs actions through TappyShareActions`() {
        assertTrue("the UI must not decide per-target behaviour itself", host.contains("TappyShareActions"))
        assertTrue(
            "the composable must not build a network URL of its own",
            !sheet.contains("facebook.com") && !sheet.contains("zalo.me"),
        )
    }

    @Test
    fun `no share label is hardcoded in the composable`() {
        // Vietnamese literals in the UI were exactly the old bug: English users saw Vietnamese.
        assertTrue("no hardcoded Vietnamese in the sheet", !sheet.contains("Chia sẻ"))
        assertTrue("no hardcoded Vietnamese in the screens", !screens.contains("Chia sẻ"))
        for (literal in listOf("\"Copy link\"", "\"More apps\"", "\"Sao chép liên kết\"")) {
            assertTrue("literal $literal must live in strings.xml", !sheet.contains(literal))
        }
    }

    @Test
    fun `english strings exist for every target`() {
        for (key in REQUIRED_STRING_KEYS) {
            assertTrue("values/strings_reviews.xml is missing $key", stringsEn.contains("name=\"$key\""))
        }
    }

    @Test
    fun `vietnamese strings exist for every target`() {
        for (key in REQUIRED_STRING_KEYS) {
            assertTrue("values-vi/strings_reviews.xml is missing $key", stringsVi.contains("name=\"$key\""))
        }
    }

    @Test
    fun `the vietnamese file is actually translated`() {
        assertTrue("expected the Vietnamese copy label", stringsVi.contains("Sao chép liên kết"))
        assertTrue("expected the Vietnamese system-share label", stringsVi.contains("Ứng dụng khác"))
    }

    @Test
    fun `nothing in the share UI claims a post was made`() {
        // Scoped to the share strings on purpose: elsewhere in this file "đã đăng" means the user
        // posted a review to TappyAI, which really did happen. The lie to guard against is a *share*
        // claiming a network published something.
        val surfaces = listOf(
            "screens" to screens,
            "host" to host,
            "sheet" to sheet,
            "en strings" to shareStrings(stringsEn),
            "vi strings" to shareStrings(stringsVi),
        )
        for ((name, src) in surfaces) {
            assertTrue(
                "$name: TappyAI hands off a link; it never posts on the user's behalf",
                !Regex("posted successfully|published successfully|posted to|đã đăng|đã chia sẻ lên", RegexOption.IGNORE_CASE)
                    .containsMatchIn(src),
            )
        }
    }

    @Test
    fun `the share strings guard is not vacuous`() {
        // If the key prefix ever changes, shareStrings() would return "" and the guard above would
        // pass on an empty string.
        assertTrue("expected share strings in values/", shareStrings(stringsEn).contains("Copy link"))
        assertTrue("expected share strings in values-vi/", shareStrings(stringsVi).contains("Sao chép liên kết"))
    }

    companion object {
        private val REQUIRED_STRING_KEYS = listOf(
            "reviews_share_facebook",
            "reviews_share_tiktok",
            "reviews_share_zalo",
            "reviews_share_copy_link",
            "reviews_share_more_apps",
            "reviews_share_tiktok_hint",
        )
    }
}
