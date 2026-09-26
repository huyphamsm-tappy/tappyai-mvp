package com.tappyai.app.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * "Tôi" in the V3 dress (2026-09-14): the same surface, the same ways out, over the same
 * ViewModel and routes. Source-pinned (Hilt + NavController screen, as the sibling tests are):
 * every destination the landing offered before is still offered and still wired to the same
 * route; the one added card opens a route the graph already registered; nothing is invented
 * about the user; the header uses an official mascot pose that exists as a file.
 */
class ProfileV3Test {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace(Regex("(?m)^\\s*//.*$"), "")

    private val screen get() = src("app/src/main/java/com/tappyai/app/profile/ProfileScreen.kt")
    private val tab get() = src("app/src/main/java/com/tappyai/app/profile/ProfileTab.kt")

    @Test
    fun `every destination is still there, in the web ProfileView order, wired to the callback it always had`() {
        val items = screen.substring(screen.indexOf("private val ACCOUNT_ITEMS = buildList {"), screen.indexOf("private val CardShape"))
        val order = Regex("""add\(ProfileMenuItem\.(\w+)\)""").findAll(items).map { it.groupValues[1] }.toList()
        // 2026-09-15: Planner joins the row where the web's `accountRows()` has it, and Following
        // (the web shell's `v3.nav.following`) sits beside it — Android has no nav row to host it.
        assertEquals(listOf("Account", "ChatHistory", "Bookings", "Preferences", "Saved", "PriceTracking", "Planner", "Social", "TappyKnows", "AppConnections", "MyReviews", "GroupDining", "UpgradeToPro"), order)
        assertTrue("Pro stays gated exactly as before", items.contains("if (SHOW_PRO_UPGRADE) add(ProfileMenuItem.UpgradeToPro)") && screen.contains("private const val SHOW_PRO_UPGRADE = false"))
        val wiring = mapOf(
            "UpgradeToPro" to "onOpenMembership", "TappyKnows" to "onOpenTappyKnows", "ChatHistory" to "onOpenChatHistory",
            "Saved" to "onOpenSaved", "Bookings" to "onOpenBookings", "Preferences" to "onOpenPreferences", "MyReviews" to "onOpenMyReviews",
            "PriceTracking" to "onOpenPriceTracking", "GroupDining" to "onOpenGroupDining", "Account" to "onOpenAccount", "AppConnections" to "onOpenAppConnections",
            "Planner" to "onOpenPlanner", "Social" to "onOpenSocial",
        )
        for ((item, cb) in wiring) assertTrue("$item → $cb", screen.contains("ProfileMenuItem.$item -> $cb"))
        assertTrue("Settings entry kept", screen.contains("R.string.profile_settings_row_title") && screen.contains("onClick = onOpenSettings"))
        assertTrue("QR kept: real sheet with a user id, coming-soon without", screen.contains("if (viewModel.userId != null) showQrSheet = true else comingSoonFeature = qrFeatureName") && screen.contains("QrProfileSheet(userId = userId, name = viewModel.profile?.fullName, onDismiss = { showQrSheet = false })"))
        assertTrue("guests still get the sign-in card, with the existing copy and action", screen.contains("if (viewModel.isAnonymous) {") && screen.contains("SignInCard(onClick = onSignIn)") && screen.contains("R.string.settings_sign_in") && screen.contains("R.string.profile_sign_in_desc"))
    }

    @Test
    fun `the tab wires the same routes as before, plus the privacy card to the route it already registered`() {
        val hub = tab.substring(tab.indexOf("composable<ProfileRoute.Hub>"), tab.indexOf("composable<ProfileRoute.AppConnections>"))
        for ((cb, route) in mapOf(
            "onOpenSettings" to "ProfileRoute.Settings", "onOpenMembership" to "ProfileRoute.Membership", "onOpenTappyKnows" to "ProfileRoute.TappyKnows",
            "onOpenChatHistory" to "ProfileRoute.ChatHistory", "onOpenSaved" to "ProfileRoute.Saved", "onOpenBookings" to "ProfileRoute.Bookings",
            "onOpenPreferences" to "ProfileRoute.Preferences", "onOpenMyReviews" to "ProfileRoute.MyReviews", "onOpenGroupDining" to "ProfileRoute.GroupDining",
            "onOpenPriceTracking" to "ProfileRoute.PriceTracking", "onOpenAccount" to "ProfileRoute.AccountGraph", "onOpenAppConnections" to "ProfileRoute.AppConnections",
            "onOpenPrivacy" to "ProfileRoute.Privacy",
        )) assertTrue("$cb → $route", hub.contains("$cb = { navController.navigate($route) }"))
        assertTrue(hub.contains("onSignIn = onSignIn,"))
        assertTrue("the privacy route was already in this graph", tab.contains("composable<ProfileRoute.Privacy> {"))
        assertTrue("Saved is the existing Saved route — no second Saved", hub.contains("onOpenSaved = { navController.navigate(ProfileRoute.Saved) }") && !screen.contains("getSaved"))
        assertTrue("the landing owns its header, like Explore", tab.contains("ReportNestedScreen(HomeTab.Profile, navController, landingOwnsHeader = true)"))
    }

    @Test
    fun `the header is Tôi plus the blurb and an official mascot pose that exists as a file`() {
        val header = screen.substring(screen.indexOf("private fun ProfileV3Header("), screen.indexOf("private fun ProfileHeroCard("))
        assertTrue(header.contains("R.string.home_tab_profile") && header.contains("R.string.profile_v3_subtitle"))
        assertTrue(header.contains("painterResource(R.drawable.tappy_wave)"))
        val pose = File(root(), "app/src/main/res/drawable-nodpi/tappy_wave.png")
        val official = File(root().parentFile, "public/tappy/wave.png")
        assertTrue(pose.isFile && official.isFile && official.readBytes().contentEquals(pose.readBytes()))
    }

    @Test
    fun `the hero shows only what the profile API returns, and the placeholder identity for a guest`() {
        val hero = screen.substring(screen.indexOf("private fun ProfileHeroCard("), screen.indexOf("internal fun SignInCard("))
        assertTrue(hero.contains("profile?.fullName?.takeIf { it.isNotBlank() }") && hero.contains("R.string.profile_header_title"))
        assertTrue(hero.contains("profile?.email?.takeIf { it.isNotBlank() }") && hero.contains("R.string.profile_header_subtitle"))
        assertTrue(hero.contains("imageUrl = profile.avatarUrl"))
        // The guest card still shows nothing beyond name / email / avatar. (The signed-in hero,
        // `ProfileHeroV3`, adds the REAL bio from `GET /api/profile` and the trigger-maintained
        // follow counts from `GET /api/users/{me}` — see PersonalSurfacesV3Test.)
        assertFalse("no invented fields", Regex("""profile\??\.(handle|username|followers|points|level|bio|joinDate)""").containsMatchIn(hero))
        assertTrue("the QR action is the hero's action", hero.contains("Icons.Filled.QrCode2") && hero.contains("onClick = onShowQr"))
    }

    @Test
    fun `the surface is V3 - palette, grouped card with coloured icon tiles, privacy card - and the copy is in both locales`() {
        assertTrue(screen.contains("V3HomeTheme {") && screen.contains(".background(HomeV3.Background)"))
        assertTrue("one grouped card, tile per row, subtle dividers", screen.contains("internal fun ProfileGroupCard(") && screen.contains("HorizontalDivider(color = HomeV3.Outline") && screen.contains(".background(tint)"))
        assertTrue("privacy card", screen.contains("private fun PrivacyCard(") && screen.contains("Icons.Filled.Shield") && screen.contains("R.string.profile_privacy_card_title") && screen.contains("PrivacyCard(onClick = onOpenPrivacy)"))
        assertFalse("no design-system grey rows any more", screen.contains("TappyMenuRow("))
        assertFalse("no emoji mascot, no generated art", Regex("""Text\(text = "[^"]*[\p{So}]""").containsMatchIn(screen))
        val en = src("app/src/main/res/values/strings_settings.xml"); val vi = src("app/src/main/res/values-vi/strings_settings.xml")
        val keys = Regex("""R\.string\.(profile_\w+)""").findAll(screen).map { it.groupValues[1] }.toSet()
        assertTrue(keys.size >= 26)
        for (k in keys) { assertTrue("$k (en)", en.contains("name=\"$k\"")); assertTrue("$k (vi)", vi.contains("name=\"$k\"")) }
        assertTrue(vi.contains(">Quyền riêng tư &amp; Bảo mật<") && vi.contains("Quản lý tài khoản và cá nhân hóa trải nghiệm của bạn với TappyAI"))
    }
}
