package com.tappyai.app.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * FOLLOW → PROFILE SYNC (real SM-A127F, 2026-10-06).
 *
 * Repro: Explore → "+" on a creator (POST /api/users/{id}/follow → 200, the rail badge turns ✓) →
 * Tôi still read "Đang theo dõi 0" and no read followed. The server (`user_follows`, trigger-kept
 * `profiles.following_count`, `GET /api/social/connections`) had the relationship; the hub did not.
 *
 * ROOT CAUSE: [ProfileHubContentViewModel] read the caller's own state once, in `init`. The Tôi tab
 * is restored from a saved back stack, so the ViewModel survives and `init` never runs again;
 * `refresh()` existed but nothing called it. The web has no such gap (`/profile` is server-assembled
 * per visit).
 *
 * The hub's data path has no local store to unit-drive — the repositories sit behind a final
 * `AuthRepository` — so, like the neighbouring hub tests, this pins the contract that makes the
 * state follow the server. The behaviour itself is proven on the device (see the report).
 */
class FollowProfileSyncTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }

    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    private val vm get() = src("app/src/main/java/com/tappyai/app/profile/ProfileHubContentViewModel.kt")
    private val screen get() = src("app/src/main/java/com/tappyai/app/profile/ProfileScreen.kt")

    private fun block(text: String, start: String, endMarker: String): String {
        val a = text.indexOf(start)
        check(a >= 0) { "missing: $start" }
        return text.substring(a, text.indexOf(endMarker, a + start.length))
    }

    // ── 1. The hub is told to re-read whenever it comes back on screen ─────────

    @Test
    fun `the hub re-reads on every resume, including the first one after returning to the tab`() {
        val s = screen
        assertTrue(s.contains("LifecycleResumeEffect(Unit) {"))
        assertTrue(block(s, "LifecycleResumeEffect(Unit) {", "V3HomeTheme {").contains("contentViewModel.refresh()"))
        // ReloadOnResume skips the first resume of a composition — and a restored tab IS a fresh
        // composition, so it would skip exactly the resume this fix is for.
        assertFalse(s.contains("ReloadOnResume"))
    }

    // ── 2. What a refresh re-reads: the caller's own graph, from the server ────

    @Test
    fun `a refresh re-reads the hero stats and the Following preview from the server`() {
        val side = block(vm, "private suspend fun loadSide", "private fun loadTab")
        assertTrue("hero stats = GET /api/users/{me}", side.contains("reviewsRepository.getUserProfile(userId)"))
        assertTrue("Following preview = GET /api/social/connections?type=following", side.contains("socialRepository.getConnections(ConnectionType.Following)"))
        assertTrue(side.contains("(profile.await() as? NetworkResult.Success)?.let { stats = it.data }"))
        assertTrue(side.contains("(connections.await() as? NetworkResult.Success)?.let { following = it.data.take(FOLLOWING_PREVIEW) }"))
        // The refresh runs that same read — there is no second, divergent path.
        assertTrue(block(vm, "fun refresh()", "private suspend fun loadSide").contains("loadSide(userId)"))
    }

    @Test
    fun `start-up still reads from the server, so a restart shows server truth`() {
        assertTrue(block(vm, "init {", "fun selectTab").contains("loadSide(userId)"))
    }

    // ── 3. A refresh never invents or blanks anything ──────────────────────────

    @Test
    fun `every value the hub shows is assigned only from a successful read`() {
        val side = block(vm, "private suspend fun loadSide", "private fun loadTab")
        val assignments = side.lines().filter { it.trim().startsWith("(") && it.contains(".await()") }
        assertEquals("one guarded assignment per read", 9, assignments.size)
        assignments.forEach { assertTrue("guarded by Success: $it", it.contains("as? NetworkResult.Success")) }
    }

    @Test
    fun `a failed read leaves the screen as it was and a refresh does not blank any tab`() {
        val refresh = block(vm, "fun refresh()", "private suspend fun loadSide")
        assertFalse("no content is nulled before the read", Regex("(?<![=!<>])=\\s*null").containsMatchIn(refresh))
        assertFalse(refresh.contains("mine = null"))
    }

    @Test
    fun `no social counter is ever computed locally`() {
        val v = vm
        assertFalse(v.contains("followingCount + 1") || v.contains("followingCount - 1"))
        assertFalse("stats are replaced whole from the server, never copied with a local count", v.contains("copy(followingCount"))
        assertFalse(v.contains("followerCount +"))
    }

    // ── 4. Guards: guests load nothing, one read at a time ─────────────────────

    @Test
    fun `a guest loads nothing on a refresh, exactly as at start-up`() {
        val refresh = block(vm, "fun refresh()", "private suspend fun loadSide")
        assertTrue(refresh.contains("if (anonymous || userId == null) return@launch"))
    }

    @Test
    fun `a refresh while a read is in flight is dropped, so a resume never doubles the start-up load`() {
        val v = vm
        assertTrue(v.contains("private var loadJob: Job? = null"))
        assertTrue(v.contains("loadJob = viewModelScope.launch {"))
        assertTrue(block(v, "fun refresh()", "private suspend fun loadSide").contains("if (loadJob?.isActive == true) return"))
    }

    // ── 5. Follow and unfollow still take the one server toggle and reconcile with it ──

    @Test
    fun `follow and unfollow are the same server toggle, reconciled with its answer on both surfaces`() {
        val feed = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt")
        assertTrue(feed.contains("repository.toggleFollow(authorId)"))
        assertTrue("success writes the server's answer", feed.contains("withFollowState(authorId, result.data)"))
        assertTrue("failure restores the previous state", feed.contains("withFollowState(authorId, shown)"))
        val creator = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewProfileViewModel.kt")
        assertTrue(creator.contains("repository.toggleFollow(userId)"))
        assertTrue(creator.contains("profile = s.profile?.copy(isFollowing = result.data)"))
    }
}
