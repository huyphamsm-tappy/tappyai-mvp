package com.tappyai.app.profile

import com.tappyai.app.profile.data.ShareHistoryRecorder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * "Đã share" on Android (2026-09-15): the collection reads the bearer-only route through the
 * profile collections client, the write goes through the same client after the chooser reported
 * a chosen component, guests load nothing, the creator profile knows nothing of it, and a tile
 * opens the existing detail screen.
 */
class ShareHistoryTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n")
        .replace(Regex("(?s)/\\*.*?\\*/"), "").replace(Regex("(?m)^\\s*//.*$"), "")

    @Test
    fun `channel is the chosen package, or the chooser when the platform withheld it`() {
        assertEquals("android:com.zing.zalo", ShareHistoryRecorder.channelFor("com.zing.zalo"))
        assertEquals("android:chooser", ShareHistoryRecorder.channelFor(null))
        assertEquals("android:chooser", ShareHistoryRecorder.channelFor(""))
    }

    @Test
    fun `the collection reads the authenticated route through the profile collections client, never the Reviews client`() {
        val api = src("app/src/main/java/com/tappyai/app/profile/data/ProfileCollectionsApi.kt")
        assertTrue(api.contains("@GET(\"api/reviews/shared\")") && api.contains("@POST(\"api/reviews/{id}/share\")"))
        assertFalse(src("app/src/main/java/com/tappyai/app/reviews/data/ReviewsApi.kt").contains("reviews/shared"))
        val vm = src("app/src/main/java/com/tappyai/app/profile/ProfileHubContentViewModel.kt")
        assertTrue(vm.contains("enum class ProfileContentTab { Posts, Liked, Saved, Hidden, Shared, Places }"))
        assertTrue(vm.contains("ProfileContentTab.Shared -> (collectionsRepository.getShared() as? NetworkResult.Success)?.also { shared = it.data } != null"))
        assertTrue("guests load nothing", vm.contains("if (anonymous || userId == null) return@launch"))
    }

    @Test
    fun `the write is the chooser's chosen-component boundary, fire-and-forget, bearer-pinned server-side`() {
        val rec = src("app/src/main/java/com/tappyai/app/profile/data/ShareHistoryRecorder.kt")
        assertTrue(rec.contains("Intent.EXTRA_CHOSEN_COMPONENT") && rec.contains("PendingIntent.getBroadcast("))
        assertTrue(rec.contains("repository.recordShare(reviewId, channelFor(chosen?.packageName))"))
        assertTrue("one process-wide receiver — a dismissed chooser leaves nothing that could fire on the next share", rec.contains("private fun ensureReceiver(app: Context)") && rec.contains("if (registered) return") && !rec.contains("unregisterReceiver"))
        // The call site (landed 2026-09-15 once ReviewShare.kt was committed in 1ec07bb): the chooser
        // carries the sender, so a chosen target — and only that — reaches the recorder.
        val share = src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewShare.kt")
        assertTrue(share.contains("ShareHistoryRecorder.chooserSender(context, review.id),"))
        val chooser = share.substring(share.indexOf("Intent.createChooser("), share.indexOf(").apply {", share.indexOf("Intent.createChooser(")))
        assertTrue("three-argument chooser", chooser.contains("send,") && chooser.contains("R.string.reviews_action_share") && chooser.contains("ShareHistoryRecorder.chooserSender(context, review.id)"))
        val repo = src("app/src/main/java/com/tappyai/app/profile/data/ProfileCollectionsRepository.kt")
        assertTrue(repo.contains("RecordShareRequestDto(channel = channel.take(64))"))
        assertFalse("no user id is sent — the server pins the bearer", repo.contains("userId") || repo.contains("user_id"))
    }

    @Test
    fun `self-only - the chip and empty copy exist for the own hub, the creator profile has none, a tile opens the detail`() {
        val hubV3 = src("app/src/main/java/com/tappyai/app/profile/ProfileHubV3.kt")
        assertTrue(hubV3.contains("ProfileContentTab.Shared -> R.string.profile_v3_tab_shared") && hubV3.contains("ProfileContentTab.Shared -> R.string.profile_v3_empty_shared"))
        val tab = src("app/src/main/java/com/tappyai/app/profile/ProfileTab.kt")
        assertTrue(tab.contains("ProfileContentTab.Liked, ProfileContentTab.Shared, ProfileContentTab.Places ->"))
        for (f in listOf("reviews/ui/ReviewsScreens.kt", "reviews/ui/SelfProfileScreen.kt")) {
            assertFalse("$f has no share collection", src("app/src/main/java/com/tappyai/app/$f").contains("getShared") || src("app/src/main/java/com/tappyai/app/$f").contains("ProfileContentTab"))
        }
        val vi = src("app/src/main/res/values-vi/strings_personal_v3.xml"); val en = src("app/src/main/res/values/strings_personal_v3.xml")
        assertTrue(vi.contains("<string name=\"profile_v3_tab_shared\">Đã share</string>") && en.contains("name=\"profile_v3_tab_shared\"") && vi.contains("name=\"profile_v3_empty_shared\"") && en.contains("name=\"profile_v3_empty_shared\""))
    }
}
