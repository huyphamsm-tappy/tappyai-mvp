package com.tappyai.app.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * "Cài đặt" in the V3 dress (2026-09-14, from the approved design reference). Source-pinned:
 * the same eight rows in the same order with the same actions, the same sound toggle, the same
 * language picker, the same delete-account request flow, the same sign-in/sign-out branch —
 * over the same ViewModel — and the header's mascot is the official waving pose file.
 * `TappyMenuRow` grew three optional knobs whose defaults leave every other caller as it was.
 */
class SettingsV3Test {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace(Regex("(?m)^\\s*//.*$"), "")

    private val screen get() = src("app/src/main/java/com/tappyai/app/profile/SettingsScreen.kt")

    @Test
    fun `the ten rows, in order, keep their actions - and the sound toggle, language and appearance pickers are the same calls`() {
        val body = screen.substring(screen.indexOf("SettingsV3Header(onBack = onBack)"), screen.indexOf("if (confirmDeleteAccount) {"))
        val rows = Regex("""(?<!sub)title = stringResource\(R\.string\.(settings_\w+)\)""").findAll(body).map { it.groupValues[1] }.toList()
        assertEquals(
            // 2026-09-17: "Giao diện" (System / Light / Dark) joins the options card after Language.
            // 2026-09-21: "Chính sách bản quyền" joins the legal rows after Privacy (F-032 cleanup —
            // opens the web /copyright policy; the native music-copyright screen was removed).
            listOf("settings_notifications", "settings_memory", "settings_tappy_notification_sound", "settings_language", "settings_appearance",
                "settings_how_to_use", "settings_terms_of_service", "settings_privacy_policy", "settings_copyright_policy", "settings_delete_account"),
            rows.filter { it != "settings_sign_out" && it != "settings_signing_out" },
        )
        for (cb in listOf("onOpenNotifications", "onOpenTappyKnows", "onOpenGuide", "onOpenTerms", "onOpenPrivacy")) assertTrue(cb, body.contains("onClick = $cb,"))
        // The copyright row opens the ONE web policy (no native duplicate), keyed to the shared origin.
        assertTrue("copyright opens the web /copyright policy", body.contains("Intent(Intent.ACTION_VIEW") && body.contains("\"\${TappyShare.CANONICAL_ORIGIN}/copyright\""))
        assertTrue(body.contains("viewModel.setTappyNotificationSound(!viewModel.tappyNotificationSoundEnabled)"))
        assertTrue(body.contains("""valueText = "${'$'}{viewModel.language.flag} ${'$'}{viewModel.language.displayName}",""") && body.contains("onClick = { showLanguagePicker = true },"))
        assertTrue(body.contains("valueText = stringResource(appearanceLabel(appearanceMode)),") && body.contains("onClick = { showAppearancePicker = true },"))
        assertTrue("delete stays a confirmed request", body.contains("onClick = { confirmDeleteAccount = true },") && screen.contains("""Uri.parse("mailto:${'$'}SUPPORT_EMAIL")""") && screen.contains("Intent(Intent.ACTION_SENDTO)"))
        assertTrue("version line", body.contains("R.string.settings_version, BuildConfig.VERSION_NAME"))
        assertTrue("guest → sign-in card with the existing Settings copy; account → sign-out", body.contains("if (viewModel.isAnonymous) {") && body.contains("SignInCard(onClick = onSignIn, subtitle = stringResource(R.string.settings_sign_in_desc))") && body.contains("onClick = viewModel::signOut,") && body.contains("R.string.settings_sign_out"))
        assertEquals("every row is the design-system row", 11, Regex("""TappyMenuRow\(""").findAll(body).count())
        assertFalse(screen.contains("Switch("))
    }

    @Test
    fun `the header is the reference's - back, Cài đặt, blurb, and the official waving mascot file`() {
        val header = screen.substring(screen.indexOf("private fun SettingsV3Header("), screen.indexOf("private fun SettingsDivider("))
        assertTrue(header.contains("Icons.AutoMirrored.Filled.ArrowBack") && header.contains("onClick = onBack"))
        assertTrue(header.contains("R.string.settings_title") && header.contains("R.string.settings_subtitle"))
        assertTrue(header.contains("painterResource(R.drawable.tappy_wave)"))
        val pose = File(root(), "app/src/main/res/drawable-nodpi/tappy_wave.png")
        val official = File(root().parentFile, "public/tappy/wave.png")
        assertTrue("the official file, byte for byte", pose.isFile && official.readBytes().contentEquals(pose.readBytes()))
        assertFalse("the reference screenshot is never embedded", Regex("""R\.drawable\.(settings|reference|mockup|screenshot)""").containsMatchIn(screen))
    }

    @Test
    fun `the dress is V3 - palette, grouped cards, accent tiles, the red destructive tile, the green On`() {
        assertTrue(screen.contains("V3HomeTheme {") && screen.contains(".background(HomeV3.Background)"))
        assertEquals("two groups + the sign-out group", 3, Regex("""ProfileGroupCard \{""").findAll(screen).count())
        assertTrue(screen.contains("accent = AccentRed,") && screen.contains("private val AccentRed = Color(0xFFEF4444)"))
        assertTrue(screen.contains("valueColor = if (viewModel.tappyNotificationSoundEnabled) AccentGreen else null,"))
        assertTrue(screen.contains("HorizontalDivider(color = HomeV3.Outline, modifier = Modifier.padding(start = 72.dp))"))
        val en = src("app/src/main/res/values/strings_settings.xml"); val vi = src("app/src/main/res/values-vi/strings_settings.xml")
        for (k in listOf("settings_subtitle", "settings_notifications_desc", "settings_memory_desc", "settings_language_desc", "settings_how_to_use_desc", "settings_terms_of_service_desc", "settings_privacy_policy_desc", "settings_copyright_policy_desc", "settings_delete_account_desc")) {
            assertTrue("$k (en)", en.contains("name=\"$k\"")); assertTrue("$k (vi)", vi.contains("name=\"$k\""))
        }
        assertTrue(vi.contains(">Tùy chỉnh TappyAI theo cách bạn muốn<"))
        assertTrue("the sound row's blurb is the existing honest copy from strings_common", src("app/src/main/res/values-vi/strings_common.xml").contains("name=\"settings_tappy_notification_sound_desc\""))
    }

    @Test
    fun `TappyMenuRow's new knobs default to the old look, so no other caller changed`() {
        val row = src("core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyMenuRow.kt")
        assertTrue(row.contains("accent: Color? = null,") && row.contains("valueColor: Color? = null,") && row.contains("titleFontWeight: FontWeight? = null,"))
        assertTrue(row.contains("val tileBackground = accent ?: if (danger) colors.errorContainer else colors.surfaceVariant"))
        assertTrue(row.contains("color = valueColor ?: colors.onSurfaceVariant,"))
    }
}
