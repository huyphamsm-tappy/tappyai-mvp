package com.tappyai.app.safety

import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response
import java.io.IOException

/**
 * Reporting and blocking, driven against a fake server. The rules that matter to Google Play
 * (user-generated content) and to the person:
 *  - a report counts ONLY when the server accepted it — a network failure, a rate limit and a
 *    server error are "not sent", never "sent", and the post stays in the feed;
 *  - Block / report-user are never called unless the server said it has them (`/api/config` → p8);
 *  - a reported post stays hidden after a restart.
 */
class SafetyRepositoryTest {

    private fun ack(code: Int = 200, body: ReportAckDto = ReportAckDto(ok = true, reported = true)): Response<ReportAckDto> =
        if (code in 200..299) Response.success(body)
        else Response.error(code, "{}".toResponseBody("application/json".toMediaType()))

    private class FakeApi : SafetyApi {
        var cfg: () -> SafetyConfigDto = { SafetyConfigDto() }
        var onReviewReport: (String, ReviewReportBodyDto) -> Response<ReportAckDto> = { _, _ -> Response.success(ReportAckDto(ok = true)) }
        var onReport: (ReportBodyDto) -> Response<ReportAckDto> = { Response.success(ReportAckDto(ok = true)) }
        var onBlock: (String) -> Response<ReportAckDto> = { Response.success(ReportAckDto(ok = true, blocked = true)) }
        var onUnblock: (String) -> Response<ReportAckDto> = { Response.success(ReportAckDto(ok = true, blocked = false)) }
        var onBlocks: () -> BlocksDto = { BlocksDto() }
        val calls = mutableListOf<String>()
        override suspend fun config(): SafetyConfigDto { calls += "config"; return cfg() }
        override suspend fun reportReview(reviewId: String, body: ReviewReportBodyDto): Response<ReportAckDto> { calls += "reportReview:$reviewId:${body.reason}"; return onReviewReport(reviewId, body) }
        override suspend fun reportComment(commentId: String, body: ReportBodyDto): Response<ReportAckDto> { calls += "report:comment:$commentId:${body.reason}"; return onReport(body) }
        override suspend fun reportUser(userId: String, body: ReportBodyDto): Response<ReportAckDto> { calls += "report:user:$userId:${body.reason}"; return onReport(body) }
        override suspend fun block(userId: String): Response<ReportAckDto> { calls += "block:$userId"; return onBlock(userId) }
        override suspend fun unblock(userId: String): Response<ReportAckDto> { calls += "unblock:$userId"; return onUnblock(userId) }
        override suspend fun blocks(): BlocksDto { calls += "blocks"; return onBlocks() }
    }

    private class MemPrefs(var reported: List<String> = emptyList(), var terms: Int = 0) : SafetyPrefs {
        override fun reported() = reported
        override fun putReported(ids: List<String>) { reported = ids }
        override fun termsVersion() = terms
        override fun putTermsVersion(version: Int) { terms = version }
    }

    private class Session(var id: String? = "me", var anon: Boolean = false) : SafetySession {
        override fun userId() = id
        override fun isAnonymous() = anon
    }

    private val on = SafetyConfigDto(P8SafetyDto(reports = true, userBlocks = true, commentModeration = true))

    // ── flags ─────────────────────────────────────────────────────────────

    @Test
    fun `flags start closed and stay closed when the config call fails`() = runTest {
        val api = FakeApi().apply { cfg = { throw IOException("offline") } }
        val repo = SafetyRepository(api, MemPrefs(), Session())
        assertEquals(SafetyFlags.Closed, repo.flags.value)
        repo.refresh()
        assertEquals(SafetyFlags.Closed, repo.flags.value)
    }

    @Test
    fun `a config without the p8 block - production today - leaves report-user and block closed`() = runTest {
        val api = FakeApi().apply { cfg = { SafetyConfigDto(p8 = null) } }
        val repo = SafetyRepository(api, MemPrefs(), Session())
        repo.refresh()
        assertFalse(repo.flags.value.userBlocks)
        assertFalse(repo.flags.value.reports)
        assertFalse("no block list is requested while blocking is closed", api.calls.contains("blocks"))
    }

    @Test
    fun `the server's p8 block opens the controls and a later outage keeps them as they were`() = runTest {
        val api = FakeApi().apply { cfg = { on } }
        val repo = SafetyRepository(api, MemPrefs(), Session())
        repo.refresh()
        assertTrue(repo.flags.value.userBlocks && repo.flags.value.reports)
        api.cfg = { throw IOException("offline") }
        repo.refresh()
        assertTrue("an outage must not close what the server opened", repo.flags.value.userBlocks)
    }

    // ── reporting a post (production route) ───────────────────────────────

    @Test
    fun `an accepted post report is filed with the mapped reason and hides the post, also after a restart`() = runTest {
        val prefs = MemPrefs()
        val api = FakeApi()
        val repo = SafetyRepository(api, prefs, Session())
        val outcome = repo.reportReview("r1", ReportReason.Sensitive)
        assertEquals(ReportOutcome.Sent, outcome)
        assertTrue(api.calls.contains("reportReview:r1:inappropriate"))
        assertTrue("r1" in repo.reportedIds.value)
        assertEquals(listOf("r1"), prefs.reported)
        // A fresh repository over the same prefs - an app restart - still hides it.
        assertTrue("r1" in SafetyRepository(FakeApi(), prefs, Session()).reportedIds.value)
    }

    @Test
    fun `a duplicate report answered 200 alreadyReported counts as sent`() = runTest {
        val api = FakeApi().apply { onReviewReport = { _, _ -> Response.success(ReportAckDto(ok = true, reported = true, alreadyReported = true)) } }
        assertEquals(ReportOutcome.Sent, SafetyRepository(api, MemPrefs(), Session()).reportReview("r1", ReportReason.Spam))
    }

    @Test
    fun `a network failure is NOT reported as sent and the post is not hidden`() = runTest {
        val api = FakeApi().apply { onReviewReport = { _, _ -> throw IOException("offline") } }
        val prefs = MemPrefs()
        val repo = SafetyRepository(api, prefs, Session())
        assertEquals(ReportOutcome.Failed, repo.reportReview("r1", ReportReason.Spam))
        assertTrue(repo.reportedIds.value.isEmpty())
        assertTrue(prefs.reported.isEmpty())
    }

    @Test
    fun `server errors and rate limits are not sent either, a missing session asks to sign in, a missing post is gone`() = runTest {
        suspend fun outcome(code: Int): ReportOutcome {
            val api = FakeApi().apply { onReviewReport = { _, _ -> ack(code) } }
            return SafetyRepository(api, MemPrefs(), Session()).reportReview("r1", ReportReason.Other)
        }
        assertEquals(ReportOutcome.Failed, outcome(500))
        assertEquals(ReportOutcome.Failed, outcome(429))
        assertEquals(ReportOutcome.Failed, outcome(400))
        assertEquals(ReportOutcome.SignIn, outcome(401))
        assertEquals(ReportOutcome.SignIn, outcome(403))
        assertEquals(ReportOutcome.Gone, outcome(404))
    }

    @Test
    fun `a sign-in refusal keeps the post and a gone post leaves the feed`() = runTest {
        val denied = FakeApi().apply { onReviewReport = { _, _ -> ack(403) } }
        val repoDenied = SafetyRepository(denied, MemPrefs(), Session(anon = true))
        repoDenied.reportReview("r1", ReportReason.Spam)
        assertTrue(repoDenied.reportedIds.value.isEmpty())

        val gone = FakeApi().apply { onReviewReport = { _, _ -> ack(404) } }
        val repoGone = SafetyRepository(gone, MemPrefs(), Session())
        repoGone.reportReview("r2", ReportReason.Spam)
        assertTrue("r2" in repoGone.reportedIds.value)
    }

    @Test
    fun `the reported list is capped so the preference never grows without bound`() = runTest {
        val repo = SafetyRepository(FakeApi(), MemPrefs(), Session())
        repeat(520) { repo.reportReview("r$it", ReportReason.Spam) }
        assertEquals(500, repo.reportedIds.value.size)
        assertTrue("r519" in repo.reportedIds.value)
        assertFalse("the oldest are dropped first", "r0" in repo.reportedIds.value)
    }

    // ── reporting a comment or a user (phase 8) ───────────────────────────

    @Test
    fun `a comment or user report is not even attempted while the server has not opened reports`() = runTest {
        val api = FakeApi()
        val repo = SafetyRepository(api, MemPrefs(), Session())
        assertEquals(ReportOutcome.Failed, repo.report(ReportTarget.User, "u1", ReportReason.Harassment))
        assertTrue(api.calls.none { it.startsWith("report:") })
    }

    @Test
    fun `with reports open a user report and a comment report go to their OWN routes with the mapped reason - there is no api-reports`() = runTest {
        val api = FakeApi().apply { cfg = { on } }
        val repo = SafetyRepository(api, MemPrefs(), Session())
        repo.refresh()
        assertEquals(ReportOutcome.Sent, repo.report(ReportTarget.User, "u1", ReportReason.Sensitive))
        assertTrue(api.calls.contains("report:user:u1:sexual"))
        assertEquals(ReportOutcome.Sent, repo.report(ReportTarget.Comment, "c1", ReportReason.Copyright))
        assertTrue("copyright is a value of the web's comment route", api.calls.contains("report:comment:c1:copyright"))
        assertTrue("never the removed merged route", api.calls.none { it == "report" || it.startsWith("report:review") })
    }

    @Test
    fun `a review reported through the generic entry still uses the production route`() = runTest {
        val api = FakeApi()
        val repo = SafetyRepository(api, MemPrefs(), Session())
        repo.report(ReportTarget.Review, "r1", ReportReason.Scam)
        assertTrue(api.calls.contains("reportReview:r1:misinformation"))
        assertTrue(api.calls.none { it.startsWith("report:") })
    }

    // ── blocking ──────────────────────────────────────────────────────────

    @Test
    fun `block is never called while the server has not opened it`() = runTest {
        val api = FakeApi()
        val repo = SafetyRepository(api, MemPrefs(), Session())
        assertFalse(repo.block("u1"))
        assertFalse(repo.unblock("u1"))
        assertTrue(api.calls.none { it.startsWith("block") || it.startsWith("unblock") })
    }

    @Test
    fun `a block that the server accepted hides that person and an unblock brings them back`() = runTest {
        val api = FakeApi().apply { cfg = { on } }
        val repo = SafetyRepository(api, MemPrefs(), Session())
        repo.refresh()
        assertTrue(repo.block("u1"))
        assertEquals(setOf("u1"), repo.blockedIds.value)
        assertTrue(repo.unblock("u1"))
        assertTrue(repo.blockedIds.value.isEmpty())
    }

    @Test
    fun `a block that failed - offline or refused - is not shown as blocked`() = runTest {
        val api = FakeApi().apply { cfg = { on }; onBlock = { throw IOException("offline") } }
        val repo = SafetyRepository(api, MemPrefs(), Session())
        repo.refresh()
        assertFalse(repo.block("u1"))
        assertTrue(repo.blockedIds.value.isEmpty())
        api.onBlock = { ack(500) }
        assertFalse(repo.block("u1"))
        assertTrue(repo.blockedIds.value.isEmpty())
    }

    @Test
    fun `nobody can block themselves or block while signed out or as a guest`() = runTest {
        val api = FakeApi().apply { cfg = { on } }
        val session = Session()
        val repo = SafetyRepository(api, MemPrefs(), session)
        repo.refresh()
        assertFalse(repo.block("me"))
        session.id = null
        assertFalse(repo.block("u1"))
        session.id = "me"; session.anon = true
        assertFalse(repo.block("u1"))
        assertTrue(api.calls.none { it.startsWith("block:") })
    }

    @Test
    fun `the block list is loaded when blocking is open and a person is signed in, and cleared on sign-out`() = runTest {
        val api = FakeApi().apply {
            cfg = { on }
            onBlocks = { BlocksDto(listOf(BlockRowDto("u1"), BlockRowDto("u2"))) }
        }
        val session = Session()
        val repo = SafetyRepository(api, MemPrefs(), session)
        repo.refresh()
        assertEquals(setOf("u1", "u2"), repo.blockedIds.value)
        session.id = null
        repo.syncBlocks()
        assertTrue(repo.blockedIds.value.isEmpty())
    }

    @Test
    fun `a failed block-list load keeps what was shown`() = runTest {
        val api = FakeApi().apply { cfg = { on }; onBlocks = { BlocksDto(listOf(BlockRowDto("u1"))) } }
        val repo = SafetyRepository(api, MemPrefs(), Session())
        repo.refresh()
        api.onBlocks = { throw IOException("offline") }
        repo.syncBlocks()
        assertEquals(setOf("u1"), repo.blockedIds.value)
    }

    // ── community rules ───────────────────────────────────────────────────

    @Test
    fun `the community rules are asked until agreed, then remembered, and asked again for a newer version`() {
        val prefs = MemPrefs()
        val repo = SafetyRepository(FakeApi(), prefs, Session())
        assertFalse(repo.termsAccepted)
        repo.acceptTerms()
        assertTrue(repo.termsAccepted)
        assertTrue("remembered across a restart", SafetyRepository(FakeApi(), prefs, Session()).termsAccepted)
        prefs.terms = UGC_TERMS_VERSION - 1
        assertFalse("an older agreement does not cover the current rules", repo.termsAccepted)
    }
}
