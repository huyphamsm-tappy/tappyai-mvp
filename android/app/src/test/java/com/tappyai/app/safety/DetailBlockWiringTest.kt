package com.tappyai.app.safety

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The post DETAIL screen (opened from a profile grid) offers "Chặn người dùng" in the post's menu — like the feed pager — and only
 * while the server says it supports blocking (`GET /api/config` → `p8.userBlocks`, web contract §4) and never on the viewer's own post.
 */
class DetailBlockWiringTest {
    private fun src(rel: String): String {
        val root = generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
        return File(root, rel).readText().replace("\r\n", "\n")
    }

    @Test fun `the detail menu gets a block entry gated by the server flag, the viewer's own post excluded`() {
        val s = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt")
        assertTrue(s.contains("onBlockAuthor = if (review.userId != uiState.currentUserId && uiState.currentUserId != null && safetyFlags.userBlocks) ({ blockFor = review }) else null"))
        assertTrue("a confirm dialog before any request", s.contains("BlockConfirmDialog(") && s.contains("viewModel.blockAuthor(r.userId)"))
    }

    @Test fun `the repository refuses to block unless the server flag is on`() {
        val repo = src("app/src/main/java/com/tappyai/app/safety/SafetyRepository.kt")
        assertTrue(repo.contains("if (!_flags.value.userBlocks || !canAct || userId == session.userId()) return false"))
    }
}
