package com.tappyai.app.account

import com.tappyai.app.account.data.DeleteOutcome
import com.tappyai.app.account.data.deleteOutcomeFor
import com.tappyai.app.account.data.isDeleteConfirmWord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * UAT3 P0 — Android in-app deletion speaks the web's contract: the same typed words, the same
 * route, the same answers, the same copy. Source-pinned where there is no runtime to test.
 */
class AccountDeletionTest {

    @Test
    fun `the typed word is accepted in either language and both tone placements`() {
        listOf("XÓA", "xóa", " XOÁ ", "DELETE", "delete", "xóa").forEach { assertTrue(it, isDeleteConfirmWord(it)) }
        listOf("", "xoa", "yes", "XÓA TÀI KHOẢN", "DEL").forEach { assertFalse(it, isDeleteConfirmWord(it)) }
    }

    @Test
    fun `server answers map to what the screen says`() {
        assertEquals(DeleteOutcome.Deleted, deleteOutcomeFor(200))
        assertEquals(DeleteOutcome.Staff, deleteOutcomeFor(409))
        assertEquals(DeleteOutcome.SignIn, deleteOutcomeFor(401))
        assertEquals(DeleteOutcome.SignIn, deleteOutcomeFor(403))
        assertEquals(DeleteOutcome.NotAvailable, deleteOutcomeFor(404))
        assertEquals(DeleteOutcome.Failed, deleteOutcomeFor(500))
    }

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }

    @Test
    fun `it calls the web's route with the shared Bearer client, never a second deletion path`() {
        val api = File(root(), "app/src/main/java/com/tappyai/app/account/data/AccountDeletionApi.kt").readText()
        assertTrue(api.contains("@POST(\"api/account/delete\")"))
        assertTrue(api.contains("retrofit.create(AccountDeletionApi::class.java)"))
        val settings = File(root(), "app/src/main/java/com/tappyai/app/profile/SettingsScreen.kt").readText()
        assertTrue("the email flow stays as the fallback", settings.contains("Intent.ACTION_SENDTO"))
        assertTrue(settings.contains("DeleteAccountDialog("))
        // Device run 2026-09-27: the subtitle still said "Request deletion…" on the in-app flow.
        assertTrue("subtitle follows the flow", settings.contains("R.string.settings_delete_account_self_desc else R.string.settings_delete_account_desc"))
    }

    @Test
    fun `the removal list has all nine published lines in both languages`() {
        for (dir in listOf("values", "values-vi")) {
            val xml = File(root(), "app/src/main/res/$dir/strings_account_delete.xml").readText()
            (1..9).forEach { assertTrue("$dir removes_$it", xml.contains("name=\"account_delete_removes_$it\"")) }
            assertTrue(xml.contains("48"))
        }
    }
}
