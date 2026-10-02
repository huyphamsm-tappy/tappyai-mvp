package com.tappyai.app.safety

import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewComment
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The pure parts of reporting/blocking: reason mapping against the servers' accepted lists, outcomes, filters, copy. */
class SafetyModelsTest {

    // Copied from the server routes (production `src/lib/reviews/reportReasons.ts`; phase8
    // `src/app/api/reports/route.ts`). If a server list changes, these fail and the mapping is revisited.
    private val reviewRouteReasons = setOf("spam", "harassment", "inappropriate", "copyright", "misinformation", "violence", "other")
    // Web contract §4 (docs/uat/ANDROID-REQUESTS.md @ origin/rc/web-uat): the comment/user routes accept these.
    private val reportsRouteReasons = setOf(
        "spam", "harassment", "inappropriate", "copyright", "misinformation", "violence", "other",
        "scam", "sensitive", "hate", "sexual", "self_harm", "impersonation",
    )

    @Test
    fun `the six reasons are exactly the ones asked for, in order`() {
        assertEquals(
            listOf("Spam", "Harassment", "Sensitive", "Scam", "Copyright", "Other"),
            ReportReason.values().map { it.name },
        )
    }

    @Test
    fun `every reason maps to a value the production post-report route accepts`() {
        ReportReason.values().forEach { assertTrue("${it.name} -> ${it.reviewWire()}", it.reviewWire() in reviewRouteReasons) }
    }

    @Test
    fun `every reason maps to a value the phase 8 reports route accepts`() {
        ReportReason.values().forEach { assertTrue("${it.name} -> ${it.reportsWire()}", it.reportsWire() in reportsRouteReasons) }
        assertEquals("copyright", ReportReason.Copyright.reportsWire())
    }

    @Test
    fun `reporting targets use the wire names of the reports route`() {
        assertEquals(listOf("review", "comment", "user"), ReportTarget.values().map { it.wire })
    }

    @Test
    fun `the outcome of an http status`() {
        assertEquals(ReportOutcome.Sent, reportOutcomeFor(200))
        assertEquals(ReportOutcome.SignIn, reportOutcomeFor(401))
        assertEquals(ReportOutcome.SignIn, reportOutcomeFor(403))
        assertEquals(ReportOutcome.Gone, reportOutcomeFor(404))
        assertEquals(ReportOutcome.Failed, reportOutcomeFor(429))
        assertEquals(ReportOutcome.Failed, reportOutcomeFor(500))
    }

    @Test
    fun `only an accepted or a gone post leaves the feed`() {
        assertTrue(ReportOutcome.Sent.removesFromFeed())
        assertTrue(ReportOutcome.Gone.removesFromFeed())
        assertFalse(ReportOutcome.Failed.removesFromFeed())
        assertFalse(ReportOutcome.SignIn.removesFromFeed())
    }

    @Test
    fun `flags are closed by default and open only on an explicit true`() {
        assertEquals(SafetyFlags.Closed, SafetyFlags.from(null))
        assertEquals(SafetyFlags(reports = true, userBlocks = false), SafetyFlags.from(P8SafetyDto(reports = true)))
        assertEquals(SafetyFlags(reports = false, userBlocks = true), SafetyFlags.from(P8SafetyDto(userBlocks = true)))
    }

    private fun review(id: String, user: String) = Review(
        id = id, userId = user, placeName = "p", placeAddress = null, rating = 0, body = "", photos = null,
        likeCount = 0, commentCount = 0, saveCount = null, createdAt = "", likedByMe = false, savedByMe = false,
        profiles = null, contentType = null, mediaUrl = null, thumbnail = null, sourceType = null, sourceUrl = null,
        hashtags = null, watchTimeAvg = null, score = null, isHidden = false,
    )

    @Test
    fun `posts by a blocked author or already reported are filtered, the viewer's own never are`() {
        val rows = listOf(review("a", "u1"), review("b", "u2"), review("c", "me"), review("d", "u3"))
        val shown = rows.withoutHidden(blocked = setOf("u1"), reported = setOf("d", "c"), me = "me")
        assertEquals(listOf("b", "c"), shown.map { it.id })
        assertTrue("nothing hidden returns the same list", rows.withoutHidden(emptySet(), emptySet(), "me") === rows)
    }

    @Test
    fun `comments by a blocked person are filtered`() {
        fun c(id: String, user: String) = ReviewComment(id = id, body = "x", createdAt = "", userId = user, profiles = null)
        val shown = listOf(c("1", "u1"), c("2", "u2"), c("3", "me")).withoutBlocked(setOf("u1", "me"), me = "me")
        assertEquals(listOf("2", "3"), shown.map { it.id })
    }

    // ── copy ──

    private fun strings(dir: String) = File("src/main/res/$dir/strings_safety.xml").readText()
    private fun keys(xml: String) = Regex("""<string name="([a-z_0-9]+)"""").findAll(xml).map { it.groupValues[1] }.toSet()

    @Test
    fun `vi and en carry the same keys`() {
        assertEquals(keys(strings("values")), keys(strings("values-vi")))
        assertTrue(keys(strings("values")).size >= 30)
    }

    @Test
    fun `the six reasons read as the owner listed them`() {
        val vi = strings("values-vi")
        listOf("Spam", "Quấy rối hoặc bắt nạt", "Nội dung nhạy cảm", "Lừa đảo", "Vi phạm bản quyền", "Khác").forEach {
            assertTrue(it, vi.contains(">$it</string>"))
        }
    }

    @Test
    fun `a failed report never says it was sent`() {
        val vi = strings("values-vi")
        val failed = Regex("""name="safety_report_failed">([^<]*)""").find(vi)!!.groupValues[1]
        assertTrue(failed.contains("Chưa gửi được"))
        assertFalse(failed.contains("Đã gửi"))
        assertEquals(com.tappyai.app.R.string.safety_report_failed, ReportOutcome.Failed.messageRes())
        assertEquals(com.tappyai.app.R.string.safety_report_sent, ReportOutcome.Sent.messageRes())
    }

    @Test
    fun `the support address is the one the rest of the app uses`() {
        assertEquals("support@tappyai.com", SAFETY_CONTACT_EMAIL)
    }
}
