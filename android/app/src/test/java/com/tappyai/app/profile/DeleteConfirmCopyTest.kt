package com.tappyai.app.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * R29 (web, 01/10) — the owner's confirmation text for account deletion (ACCOUNT_SELF_DELETE_ENABLED ON at release).
 * Only the TEXT changed: the data contract and the call flow (type XÓA → POST /api/account/delete → sign out) are untouched.
 */
class DeleteConfirmCopyTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun read(rel: String) = File(root(), rel).readText()

    private fun str(xml: String, name: String): String =
        Regex("""<string name="$name"[^>]*>([\s\S]*?)</string>""").find(xml)!!.groupValues[1].trim()

    private val vi get() = read("app/src/main/res/values-vi/strings_account_delete.xml")
    private val en get() = read("app/src/main/res/values/strings_account_delete.xml")

    @Test
    fun `the Vietnamese text is the owner's, word for word`() {
        assertEquals(
            "Xóa tài khoản vĩnh viễn? Toàn bộ dữ liệu của bạn sẽ bị xóa ngay và không thể khôi phục: lịch sử chat, địa điểm đã lưu, bài đăng, ảnh và clip.",
            str(vi, "account_delete_warn_lead"),
        )
        assertEquals(
            "Gói trả phí và credit còn lại sẽ mất, Tappy không hoàn lại phần chưa dùng. Xóa tài khoản không tự hủy gói trên App Store hoặc Google Play, bạn cần hủy gói ở đó để không bị tính phí tiếp.",
            str(vi, "account_delete_warn_plan"),
        )
        assertEquals(
            "Nếu bạn đang có gói trả phí, gói và credit còn lại sẽ mất, Tappy không hoàn lại phần chưa dùng. Xóa tài khoản không tự hủy gói trên App Store hoặc Google Play, bạn cần hủy gói ở đó để không bị tính phí tiếp.",
            str(vi, "account_delete_warn_plan_generic"),
        )
        assertEquals("Gõ %1\$s để xác nhận.", str(vi, "account_delete_confirm_label"))
        assertEquals("XÓA", str(vi, "account_delete_confirm_word"))
    }

    @Test
    fun `the English text is web's accountDelete copy`() {
        assertEquals(
            "Delete your account permanently? All your data will be deleted immediately and cannot be recovered: chat history, saved places, posts, photos and clips.",
            str(en, "account_delete_warn_lead"),
        )
        assertEquals(
            "Your paid plan and any remaining credit will be lost, and Tappy does not refund the unused part. Deleting your account does not cancel your subscription on the App Store or Google Play — cancel it there so you are not charged again.",
            str(en, "account_delete_warn_plan"),
        )
        assertEquals("Type %1\$s to confirm.", str(en, "account_delete_confirm_label"))
    }

    @Test
    fun `the plan line shows only for a KNOWN paid plan - unknown gets the generic line, a known free account none`() {
        val d = read("app/src/main/java/com/tappyai/app/profile/DeleteAccountDialog.kt")
        val block = d.substringAfter("when (paidPlan) {").substringBefore("}\n")
        assertTrue(block.contains("true -> Text(stringResource(R.string.account_delete_warn_plan)"))
        assertTrue(block.contains("null -> Text(stringResource(R.string.account_delete_warn_plan_generic)"))
        assertTrue(block.contains("false -> Unit"))
        assertTrue(d.contains("account_delete_warn_lead"))
    }

    @Test
    fun `the plan comes from the data the app already reads - no new endpoint, no new field`() {
        val vm = read("app/src/main/java/com/tappyai/app/profile/SettingsViewModel.kt")
        assertTrue(vm.contains("membership.getStatus()") && vm.contains(".isPro"))
        assertTrue(vm.contains("var paidPlan by mutableStateOf<Boolean?>(null)"))
    }

    @Test
    fun `the call flow is unchanged - typed word, POST, sign out - and the row stays discreet`() {
        val vm = read("app/src/main/java/com/tappyai/app/profile/SettingsViewModel.kt")
        assertTrue(vm.contains("deletionApi.deleteAccount(DeleteAccountRequestDto(typed.trim()))"))
        assertTrue(vm.contains("authRepository.signOut()"))
        val screen = read("app/src/main/java/com/tappyai/app/profile/SettingsScreen.kt")
        val row = screen.substringAfter("icon = Icons.Filled.DeleteOutline,").substringBefore("onClick = { confirmDeleteAccount = true },")
        assertFalse("no red", row.contains("AccentRed") || row.contains("danger = true"))
        assertTrue("plain row like its siblings (muted slate tile)", row.contains("accent = AccentSlate,"))
        // the flag-OFF branch stays in the code (email request) for any build whose server has the flag off
        assertTrue(screen.contains("Intent.ACTION_SENDTO"))
    }
}
