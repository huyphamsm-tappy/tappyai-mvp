package com.tappyai.app.auth

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the sign-in entry point for anonymous users.
 *
 * WHY THESE ARE SOURCE-LEVEL. The behaviour lives entirely in Compose composition and root
 * navigation: `HomeShellScreen` builds its own `rememberNavController()` and `ProfileTab` nests
 * another, so reaching the root graph's `AuthRoute.Login` requires a callback threaded down three
 * levels. Rendering any of that in a JVM unit test needs Robolectric or compose-ui-test, neither of
 * which this module has, and adding one to prove a callback is wired would be a bigger change than
 * the fix. What CAN be pinned mechanically is the wiring itself and the branch that selects sign-in
 * vs sign-out — which is precisely what regressed here. The rendered result is proven on the device
 * in CASE E; these tests exist so a refactor cannot silently unhook it again.
 *
 * The defect being guarded: `AuthRoute.Login` was registered in the graph and `LoginScreen` worked,
 * but nothing ever navigated to it on user action. Anonymous minting removed the last automatic
 * path (`Unauthenticated → Login`), stranding the destination and making the anon→account claim —
 * the whole point of anonymous chat — unreachable.
 */
class AnonymousSignInEntryPointTest {

    private fun source(relativePath: String): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relativePath)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        throw AssertionError("$relativePath not found — did the module move?")
    }

    /** Source with comment lines dropped, so no assertion can be satisfied by prose describing it. */
    private fun code(relativePath: String): String = source(relativePath)
        .readLines()
        .filterNot { it.trimStart().startsWith("//") || it.trimStart().startsWith("*") }
        .joinToString("\n")

    private val navHost = "app/src/main/java/com/tappyai/app/navigation/AppNavHost.kt"
    private val homeShell = "app/src/main/java/com/tappyai/app/home/HomeShellScreen.kt"
    private val profileTab = "app/src/main/java/com/tappyai/app/profile/ProfileTab.kt"
    private val settings = "app/src/main/java/com/tappyai/app/profile/SettingsScreen.kt"
    private val settingsVm = "app/src/main/java/com/tappyai/app/profile/SettingsViewModel.kt"
    private val profileScreen = "app/src/main/java/com/tappyai/app/profile/ProfileScreen.kt"

    @Test
    fun `the guard can find every file it asserts on`() {
        // Without this, a relocation would make every assertion below pass vacuously.
        for (p in listOf(navHost, homeShell, profileTab, settings, settingsVm, profileScreen)) {
            assertTrue("missing $p", code(p).isNotEmpty())
        }
    }

    @Test
    fun `the root graph navigates to Login on user action, not only on Unauthenticated`() {
        val src = code(navHost)
        assertTrue(
            "AppNavHost must hand HomeShellScreen a callback that navigates to AuthRoute.Login; " +
                "without it the Login destination is registered but unreachable by the user",
            Regex("""onSignIn\s*=\s*\{[^}]*navigate\(AuthRoute\.Login\)""").containsMatchIn(src),
        )
    }

    @Test
    fun `entering Login from Anonymous must not clear the back stack or the session`() {
        // popUpTo(graph, inclusive) is how the automatic auth transitions clear the stack. Doing it
        // here would tear down HomeShell while the anonymous session is still live and the claim
        // has not happened yet — the user must be able to back out and still be their anonymous
        // self, with their conversation intact.
        val src = code(navHost)
        val call = Regex("""onSignIn\s*=\s*\{[^}]*\}""").find(src)?.value ?: ""
        assertFalse(
            "the user-initiated sign-in navigation must not popUpTo — it would destroy the live " +
                "anonymous session's back stack before the claim runs",
            call.contains("popUpTo"),
        )
    }

    @Test
    fun `the callback is threaded to both surfaces without a second NavController`() {
        assertTrue(
            "HomeShellScreen must accept onSignIn",
            Regex("""fun HomeShellScreen\([\s\S]*?onSignIn:\s*\(\)\s*->\s*Unit""").containsMatchIn(code(homeShell)),
        )
        assertTrue(
            "ProfileTab must accept onSignIn",
            Regex("""fun ProfileTab\([\s\S]*?onSignIn:\s*\(\)\s*->\s*Unit""").containsMatchIn(code(profileTab)),
        )
        val tab = code(profileTab)
        assertTrue("ProfileTab must forward onSignIn to SettingsScreen", tab.contains("onSignIn = onSignIn"))
        assertTrue(
            "ProfileTab must reach BOTH surfaces — Settings and the Profile account area",
            Regex("""onSignIn\s*=\s*onSignIn""").findAll(tab).count() >= 2,
        )
        assertFalse(
            "no second NavController may be introduced for this",
            tab.contains("rememberNavController()") && tab.indexOf("rememberNavController()") != tab.lastIndexOf("rememberNavController()"),
        )
    }

    @Test
    fun `anonymity is read from the authoritative session state, never inferred`() {
        val vm = code(settingsVm)
        assertTrue(
            "SettingsViewModel must derive anonymity from AuthRepository.isAnonymous(), which " +
                "decodes the is_anonymous JWT claim",
            vm.contains("authRepository.isAnonymous()"),
        )
        // The forbidden shortcuts. currentUserId() is non-null for an anonymous session too, and a
        // missing profile/email is a CONSEQUENCE of anonymity, not evidence of it.
        assertFalse(
            "must not infer anonymity from a null user id",
            Regex("""currentUserId\(\)\s*==\s*null""").containsMatchIn(vm),
        )
        assertFalse("must not infer anonymity from email", vm.contains("email == null"))
        assertFalse("must not infer anonymity from a missing profile", vm.contains("profile == null"))
    }

    @Test
    fun `Settings shows sign-in to anonymous users and keeps sign-out for accounts`() {
        val src = code(settings)
        assertTrue(
            "Settings must branch on the anonymous state",
            Regex("""isAnonymous""").containsMatchIn(src),
        )
        assertTrue(
            "an anonymous user must be offered sign-in",
            src.contains("R.string.settings_sign_in"),
        )
        assertTrue(
            "authenticated users must keep the existing sign-out row",
            src.contains("R.string.settings_sign_out"),
        )
    }

    @Test
    fun `the Profile account area also offers sign-in when anonymous`() {
        val src = code(profileScreen)
        assertTrue(
            "the Profile surface must expose sign-in too — Settings alone is two taps deep",
            src.contains("R.string.profile_sign_in") || src.contains("R.string.settings_sign_in"),
        )
        assertTrue("Profile must branch on the anonymous state", src.contains("isAnonymous"))
    }

    @Test
    fun `the new strings exist in both English and Vietnamese`() {
        // This project's convention (measured, not assumed): values/ is ENGLISH — the default —
        // and values-vi/ carries Vietnamese. Both live in strings_settings.xml, not strings.xml.
        val en = source("app/src/main/res/values/strings_settings.xml").readText()
        val vi = source("app/src/main/res/values-vi/strings_settings.xml").readText()
        for (key in listOf("settings_sign_in", "settings_sign_in_desc", "profile_sign_in_desc")) {
            assertTrue("$key missing from values/strings_settings.xml (English)", en.contains("\"$key\""))
            assertTrue("$key missing from values-vi/strings_settings.xml (Vietnamese)", vi.contains("\"$key\""))
        }
        // No hardcoded UI text: the row labels must come from resources.
        assertFalse(code(settings).contains("\"Đăng nhập\""))
        assertFalse(code(profileScreen).contains("\"Đăng nhập\""))
    }
}
