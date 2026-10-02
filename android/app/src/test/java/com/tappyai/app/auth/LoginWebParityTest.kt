package com.tappyai.app.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parity 2026-09-28: the web /login card offers Google, Zalo, then "hoặc", Email + Mật khẩu +
 * "Đăng nhập", a "Tạo tài khoản" link and "Tiếp tục với tư cách Khách". Android offered Google and
 * Zalo only (the email block was a hidden magic-link form), and its guest button existed only in
 * debug builds. Same primitive as the web: Supabase password sign-in, one refusal message for
 * every failure (no account-enumeration oracle), no forgot-password control (owner, 2026-09-10).
 */
class LoginWebParityTest {

    private val auth = File("../features/auth/src/main")
    private val screen get() = auth.resolve("java/com/tappyai/features/auth/ui/login/LoginScreen.kt").readText()
    private val vm get() = auth.resolve("java/com/tappyai/features/auth/ui/login/LoginViewModel.kt").readText()
    private val repo get() = auth.resolve("java/com/tappyai/features/auth/data/AuthRepository.kt").readText()

    private fun strings(dir: String): Map<String, String> =
        Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""").findAll(auth.resolve("res/$dir/strings.xml").readText())
            .associate { it.groupValues[1] to it.groupValues[2] }

    @Test
    fun `password sign-in uses the Supabase password primitive`() {
        assertTrue(repo.contains("suspend fun signInWithPassword(email: String, password: String)"))
        assertTrue(repo.contains("signInWith(Email)"))
        assertTrue("one message for every refusal", vm.contains("R.string.auth_signin_failed"))
        assertFalse("provider text is never forwarded on password failure", Regex("""onPasswordSignInClick[\s\S]*?toUserMessage""").containsMatchIn(vm.substringAfter("fun onPasswordSignInClick").substringBefore("\n    fun ")))
    }

    @Test
    fun `the card renders email, password, sign in, create account and continue as guest`() {
        for (key in listOf("auth_email_label", "auth_email_placeholder", "auth_password_label", "auth_password_placeholder", "auth_password_submit", "auth_create_account", "auth_continue_guest")) {
            assertTrue(key, screen.contains("R.string.$key"))
        }
        assertTrue("password is masked", screen.contains("PasswordVisualTransformation()"))
        assertTrue("guest entry is not debug-only any more", screen.contains("onClick = onContinueAsGuest"))
    }

    @Test
    fun `labels are the web labels`() {
        val vi = strings("values-vi")
        val expected = mapOf(
            "auth_email_label" to "Email",
            "auth_email_placeholder" to "ban@email.com",
            "auth_password_label" to "Mật khẩu",
            "auth_password_placeholder" to "Tối thiểu 6 ký tự",
            "auth_password_submit" to "Đăng nhập",
            "auth_create_account" to "Tạo tài khoản",
            "auth_continue_guest" to "Tiếp tục với tư cách Khách",
            "auth_signin_failed" to "Email hoặc mật khẩu không đúng.",
        )
        for ((k, v) in expected) assertEquals(k, v, vi[k])
    }
}
