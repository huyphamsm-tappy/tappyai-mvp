package com.tappyai.app.reviews.ui

import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.SEED_REVIEWS
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * EXPLORE FOLLOW TOGGLE ON STALE STATE (real SM-A127F, 2026-10-06).
 *
 * The server held "following" (made on the author's profile); the Explore rail still showed "+"
 * because its row came from an older feed read and the ViewModel outlives the screen. Tapping "+"
 * sent `POST /api/users/{id}/follow` - a TOGGLE - and silently UNFOLLOWED.
 *
 * The rule now: the toggle is sent only when the server holds the opposite of what the tap asks
 * for ([followToggleAction]); badges are reconciled with the server's Following list whenever
 * Explore comes back ([withFollowingSet]).
 */
class ExploreFollowStaleStateTest {

    // -- what a tap may do ------------------------------------------------------

    @Test
    fun `stale plus while the server already follows - the tap sends nothing and the row shows followed`() {
        // Row shows "+" (not following), the tap asks to FOLLOW, the server already holds following.
        assertEquals(FollowToggleAction.AlreadyDone, followToggleAction(target = true, server = true))
    }

    @Test
    fun `stale check while the server does not follow - the tap sends nothing and the row shows not followed`() {
        // The reverse: row shows a check, the tap asks to UNFOLLOW, the server already holds not-following.
        assertEquals(FollowToggleAction.AlreadyDone, followToggleAction(target = false, server = false))
    }

    @Test
    fun `fresh state - the toggle is sent, in both directions`() {
        assertEquals(FollowToggleAction.Send, followToggleAction(target = true, server = false))
        assertEquals(FollowToggleAction.Send, followToggleAction(target = false, server = true))
    }

    @Test
    fun `a server that cannot be read never causes a flip`() {
        assertEquals(FollowToggleAction.Abort, followToggleAction(target = true, server = null))
        assertEquals(FollowToggleAction.Abort, followToggleAction(target = false, server = null))
    }

    @Test
    fun `the toggle is sent if and only if the server holds the opposite of the tap`() {
        for (target in listOf(true, false)) for (server in listOf(true, false)) {
            val sends = followToggleAction(target, server) == FollowToggleAction.Send
            assertEquals("target=$target server=$server", server != target, sends)
        }
    }

    // -- reconciling the rows with the server's Following list -----------------

    private val rows: List<Review> = SEED_REVIEWS.take(4)
    private val a = rows[0].userId
    private val other = rows.first { it.userId != a }.userId

    @Test
    fun `an author the server follows shows followed, never a plus`() {
        val stale = rows.map { it.copy(isFollowingAuthor = false) }
        val out = stale.withFollowingSet(setOf(a), complete = true, inFlight = emptySet())
        out.filter { it.userId == a }.forEach { assertTrue(it.isFollowingAuthor) }
        out.filter { it.userId != a }.forEach { assertFalse(it.isFollowingAuthor) }
    }

    @Test
    fun `an author the server no longer follows shows not followed, never a check`() {
        val stale = rows.map { it.copy(isFollowingAuthor = true) }
        val out = stale.withFollowingSet(emptySet(), complete = true, inFlight = emptySet())
        assertTrue(out.none { it.isFollowingAuthor })
    }

    @Test
    fun `a truncated list proves nothing about authors that are absent from it`() {
        val stale = rows.map { it.copy(isFollowingAuthor = true) }
        val out = stale.withFollowingSet(setOf(other), complete = false, inFlight = emptySet())
        // `a` is absent from a full page: it may simply be past the cut, so its badge is left alone.
        out.filter { it.userId == a }.forEach { assertTrue(it.isFollowingAuthor) }
        // ...while presence is always proof.
        val fromFalse = rows.map { it.copy(isFollowingAuthor = false) }.withFollowingSet(setOf(a), complete = false, inFlight = emptySet())
        fromFalse.filter { it.userId == a }.forEach { assertTrue(it.isFollowingAuthor) }
    }

    @Test
    fun `an author with a toggle in flight is left exactly as it is`() {
        val stale = rows.map { it.copy(isFollowingAuthor = false) }
        val out = stale.withFollowingSet(setOf(a), complete = true, inFlight = setOf(a))
        out.filter { it.userId == a }.forEach { assertFalse(it.isFollowingAuthor) }
    }

    @Test
    fun `rows that already agree are the same objects`() {
        val agreed = rows.map { it.copy(isFollowingAuthor = it.userId == a) }
        val out = agreed.withFollowingSet(setOf(a), complete = true, inFlight = emptySet())
        agreed.indices.forEach { assertSame(agreed[it], out[it]) }
    }

    // -- wiring: the ViewModel and the screen use them --------------------------

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace("\r\n", "\n")
                .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private val vm get() = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt")

    private fun toggle(): String = vm.substring(vm.indexOf("fun toggleFollow(review: Review) {"), vm.indexOf("fun syncFollowState()"))

    @Test
    fun `the toggle asks the server first and sends only when told to`() {
        val fn = toggle()
        assertTrue("the authoritative read is the server's own is_following", fn.contains("repository.getUserProfile(authorId)") && fn.contains("?.isFollowing"))
        assertTrue(fn.contains("followToggleAction(target = target, server = serverNow)"))
        // The POST appears exactly once, inside the Send branch.
        assertEquals(1, Regex("repository\\.toggleFollow\\(authorId\\)").findAll(fn).count())
        assertTrue(fn.indexOf("FollowToggleAction.Send ->") < fn.indexOf("repository.toggleFollow(authorId)"))
    }

    @Test
    fun `a failed read or a failed toggle rolls the optimistic flip back to what was shown`() {
        val fn = toggle()
        assertEquals("abort + toggle failure both restore the shown state", 2, Regex("withFollowState\\(authorId, shown\\)").findAll(fn).count())
        assertTrue("the in-flight guard is always released", fn.contains("} finally {") && fn.contains("followInFlight -= authorId"))
    }

    @Test
    fun `Explore reconciles its badges every time it comes back, from the server's Following list`() {
        val v = vm
        assertTrue(v.contains("socialRepository.getConnections(ConnectionType.Following)"))
        assertTrue("an answer older than a tap is discarded", v.contains("if (epoch != followEpoch) return@launch"))
        assertTrue(v.contains("withFollowingSet(ids, complete, followInFlight.toSet())"))
        assertTrue("only Explore, only a signed-in viewer", v.contains("if (source != ReviewsFeedSource.Explore || _uiState.value.currentUserId == null) return"))
        val screen = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        assertTrue(screen.substring(screen.indexOf("LifecycleResumeEffect(Unit) {")).take(200).contains("viewModel.syncFollowState()"))
    }

    @Test
    fun `no follow count is invented locally`() {
        val v = vm
        assertFalse(v.contains("followerCount +") || v.contains("followingCount +"))
    }
}
