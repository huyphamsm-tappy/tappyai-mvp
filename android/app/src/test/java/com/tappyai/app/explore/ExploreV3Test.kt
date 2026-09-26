package com.tappyai.app.explore

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The V3 Explore (Khám phá) contract — the approved video-feed mockup (`V3-Mockup.png/…05_11_01`),
 * implemented 2026-09-12 on the existing reviews feed (same ViewModel, routes and data).
 *
 * What the mockup fixes: an opaque brand header (lockup + circular actions) and a tab row ABOVE
 * the clip; the active tab underlined in purple; the author's avatar beside the handle in the
 * caption block, the caption on two lines, the place under an orange pin; a rail of translucent
 * tiles with compact counts. What it does NOT get, and why, is pinned here too: no Food/Travel/Life
 * tabs (no category filter on the feed endpoint), no Follow pill (no follow state on the feed
 * row), no share count (none on the wire), no unread dot (no unread state in the app).
 *
 * Source-guard style, like `HomeAiFirstTest`: the screen is wired to a Hilt ViewModel, a nested
 * NavController and ExoPlayer, and a Robolectric pass would exercise the mocks; the inventory and
 * the order of what the screen composes is what a source read establishes honestly.
 */
class ExploreV3Test {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private fun res(rel: String): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null && !File(dir, "app/src/main/res").isDirectory) dir = dir.parentFile
        return File(dir ?: error("android root not found"), "app/src/main/res/$rel")
    }

    private val screens by lazy { src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt") }
    private val card by lazy { src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewCard.kt") }
    private val shell by lazy { src("app/src/main/java/com/tappyai/app/home/HomeShellScreen.kt") }

    // ── counts beside the rail icons ──────────────────────────────────────

    @Test
    fun `rail counts print like the mockup - 12,4K, 266, 1,2M`() {
        assertEquals("0", compactCount(0))
        assertEquals("266", compactCount(266))
        assertEquals("999", compactCount(999))
        assertEquals("1K", compactCount(1_000))
        assertEquals("1.2K", compactCount(1_234))
        assertEquals("12.4K", compactCount(12_400))
        assertEquals("12.4K", compactCount(12_449))
        assertEquals("100K", compactCount(100_000))
        assertEquals("1M", compactCount(1_000_000))
        assertEquals("1.2M", compactCount(1_240_000))
    }

    // ── chrome: the floating header and segment OVER the clip (reference 2026-09-13) ──

    @Test
    fun `the feed is one box - the pager fills it, the brand header and the segment float over it`() {
        val feed = screens.substring(screens.indexOf("internal fun ReviewsFeedScreen("), screens.indexOf("internal fun ProfileClipsScreen("))
        val pager = feed.indexOf("ReviewClipPager(")
        val header = feed.indexOf("FeedTopBar(")
        val tabs = feed.indexOf("FeedTabs(")
        assertTrue("the pager first, the chrome drawn after it (over it)", pager in 1 until header && header < tabs)
        assertTrue("the chrome floats at the top, below the status bar", feed.contains(".align(Alignment.TopCenter)") && feed.contains(".statusBarsPadding()"))
        assertTrue("the feed keeps the dock's height free under each card", feed.contains("bottomClearance = ExploreV3.DockClearance,"))
        assertFalse("no opaque header band above the clip", feed.contains(".weight(1f)"))
        assertTrue("the pager block itself lives in ReviewClipPager.kt, shared with the profile clip pager",
            src("app/src/main/java/com/tappyai/app/reviews/ui/ReviewClipPager.kt").contains("VerticalPager("))
        assertTrue("the ground is the V3 night surface", feed.contains(".background(ExploreV3.Background)"))
    }

    @Test
    fun `the header is the TappyAI brand lockup - white Tappy, blue AI, the official mascot - plus the tagline and glass search, bell and profile circles`() {
        val bar = screens.substring(screens.indexOf("private fun FeedTopBar("), screens.indexOf("private fun ExploreHeaderAction("))
        val mark = screens.substring(screens.indexOf("private fun BrandWordmark3D("), screens.indexOf("private val WordmarkTappySideNear"))
        assertTrue("the header composes the dimensional wordmark", bar.contains("BrandWordmark3D()"))
        assertTrue("the brand's own two words, Tappy white and AI brand blue on the top face",
            mark.contains("withStyle(SpanStyle(brush = Brush.verticalGradient(listOf(Color.White, WordmarkTappyFaceBase)))) { append(tappy) }") && mark.contains("withStyle(SpanStyle(brush = Brush.verticalGradient(listOf(WordmarkAiFaceTop, WordmarkAiFaceBase)))) { append(ai) }")
                && mark.contains("stringResource(R.string.home_v3_brand_tappy)") && mark.contains("stringResource(R.string.home_v3_brand_ai)"))
        assertTrue("a layered extrusion behind the face, not a single drop shadow", mark.contains("for (i in layers downTo 1)") && mark.contains("modifier = Modifier.offset(x = (i * 0.45f).dp, y = (i * 0.85f).dp)") && mark.contains("val layers = 7") && mark.contains("lerp(WordmarkTappySideNear, WordmarkTappySideFar, t)"))
        assertTrue("the official mascot (owner's pose library, searching pose) beside it, small, part of the lockup", bar.contains("painterResource(R.drawable.tappy_searching)") && bar.contains(".size(40.dp)"))
        assertFalse("no sparkle glyph, no all-caps text wordmark any more", bar.contains("""\u2726""") || bar.contains("reviews_feed_brand"))
        assertTrue("the tagline is unchanged", bar.contains("stringResource(R.string.reviews_feed_tagline)"))
        assertTrue("large bold wordmark, same size as before", mark.contains("fontSize = 26.sp") && mark.contains("FontWeight.ExtraBold"))
        assertEquals("the drawable is the byte-identical pose file (public/tappy/searching.png)", 68892L, res("drawable-nodpi/tappy_searching.png").length())
        assertTrue(bar.contains("onClick = onSearch") && bar.contains("Icons.Filled.Search"))
        assertTrue(bar.contains("onClick = onNotifications") && bar.contains("Icons.Filled.NotificationsNone"))
        assertTrue(bar.contains("onClick = onProfile") && bar.contains("Icons.Filled.PersonOutline"))
        assertTrue("the header's own Create Post + (owner ruling 2026-09-13)", bar.contains("onClick = onCompose") && bar.contains("Icons.Filled.Add"))
        assertTrue(bar.contains("stringResource(R.string.reviews_search_label)") && bar.contains("stringResource(R.string.reviews_notifications_label)") && bar.contains("stringResource(R.string.reviews_self_profile_open)") && bar.contains("stringResource(R.string.reviews_tab_compose)"))
        // 2026-09-17: the bell carries the REAL unread count (GET /api/notifications → unread_count, see
        // InboxBadgeTest) — drawn only above zero, never a decorative dot.
        assertTrue("the bell's badge is the real count, not a decoration", bar.contains("UnreadBadge(count = unreadCount)"))
        assertFalse("no faked dot", bar.contains("Badge(") && !bar.contains("UnreadBadge("))
        val action = screens.substring(screens.indexOf("private fun ExploreHeaderAction("), screens.indexOf("internal fun ReviewDetailScreen("))
        assertTrue("48dp glass circle with a thin light border", action.contains(".size(48.dp)") && action.contains(".clip(CircleShape)") && action.contains(".background(ExploreV3.Glass)") && action.contains("ExploreV3.GlassBorder"))
    }

    @Test
    fun `the segment keeps the three real feeds in a floating pill, the selected one filled indigo`() {
        val tabs = screens.substring(screens.indexOf("private fun FeedTabs("), screens.indexOf("fun FeedEmptyState("))
        assertEquals(1, Regex("ReviewFeedType\\.ForYou\\)").findAll(tabs).count())
        assertEquals(1, Regex("ReviewFeedType\\.Following\\)").findAll(tabs).count())
        assertEquals(1, Regex("ReviewFeedType\\.Latest\\)").findAll(tabs).count())
        assertFalse("no Food/Travel/Life without a backend filter", tabs.contains("reviews_tab_food") || tabs.contains("reviews_tab_travel") || tabs.contains("reviews_tab_life"))
        assertTrue("a glass pill container", tabs.contains(".background(ExploreV3.Glass)") && tabs.contains("RoundedCornerShape(50)"))
        assertTrue("the selected segment is the indigo fill", tabs.contains("if (selected) ExploreV3.SegmentSelected else Color.Transparent"))
        assertTrue("15sp, medium/semibold", tabs.contains("fontSize = 15.sp"))
        assertTrue("the same ViewModel switch as before", screens.contains("onSelect = viewModel::onFeedTypeChange,"))
    }

    // ── the card ──────────────────────────────────────────────────────────

    @Test
    fun `the lower-left block is place pill, creator, a two-line caption - no headline over the clip`() {
        val pill = card.substring(card.indexOf("private fun ReviewPlacePill("), card.indexOf("private fun ReviewCreatorBlock("))
        assertTrue("pill = address, else the place name, never for a share-only post", pill.contains("if (isShareOnlyName(review.placeName)) return") && pill.contains("if (!review.placeAddress.isNullOrBlank()) review.placeAddress else review.placeName"))
        assertFalse("no city/district field is invented", pill.contains("review.city") || pill.contains("district"))
        val creator = card.substring(card.indexOf("private fun ReviewCreatorBlock("), card.indexOf("private fun ReviewCardSinglePhotoPreview("))
        val place = creator.indexOf("ReviewPlacePill(review = review)")
        val identity = creator.indexOf("TappyAvatar(")
        val caption = creator.indexOf("text = review.body.trim(),")
        assertTrue("place → avatar+handle → caption", place in 1 until identity && identity < caption)
        assertTrue("both open the author's profile", creator.contains("onClick = onAuthorClick"))
        assertTrue("the caption is compact, two lines, not a headline", creator.contains("fontSize = 15.sp") && creator.contains("maxLines = 2") && !creator.contains("fontSize = 30.sp"))
        // Music reuse retired: the sound pill and its SoundSheet tap are gone from the creator block.
        assertFalse("no sound-reuse pill remains", creator.contains("reviews_sound_original") || creator.contains("onSoundClick"))
        assertFalse("no verified badge without verification data", creator.contains("Verified"))
        val body = card.substring(card.indexOf("fun ReviewCard("), card.indexOf("private fun ReviewMediaBackground("))
        assertFalse("the mid-screen content block is gone: the clip's centre stays clear", body.contains("ReviewContentBlock(") || body.contains("fillMaxHeight("))
        assertTrue("the block sits bottom-left", body.contains(".align(Alignment.BottomStart)"))
        assertEquals("the caption is drawn once (the isNotBlank guard and the Text)", 2, Regex("""review\.body""").findAll(creator).count() + Regex("""review\.body""").findAll(body).count())
    }

    @Test
    fun `the rail is avatar, like, comment, Hoi Tappy, share, more - glass circles, only Hoi Tappy accented`() {
        val rail = card.substring(card.indexOf("private fun ReviewActionRail("), card.indexOf("private fun RailAvatar("))
        val avatar = rail.indexOf("RailAvatar(")
        val like = rail.indexOf("compactCount(review.likeCount)")
        val comment = rail.indexOf("compactCount(review.commentCount)")
        val ask = rail.indexOf("R.string.reviews_ask_tappy")
        val share = rail.indexOf("R.string.reviews_action_share")
        val more = rail.indexOf("RailMore(")
        assertTrue("order avatar → like → comment → Hỏi Tappy → share → more", avatar in 1 until like && like < comment && comment < ask && ask < share && share < more)
        assertTrue("Hỏi Tappy is the accented one, drawn only when the bridge exists", rail.contains("if (onAskTappy != null) {") && rail.contains("accent = true,"))
        assertFalse("no share count is invented", rail.contains("shareCount"))
        val action = card.substring(card.indexOf("private fun RailAction("), card.indexOf("private fun RailMore("))
        assertTrue("48dp glass circle", action.contains(".size(48.dp)") && action.contains(".clip(CircleShape)") && action.contains(".background(ExploreV3.Glass)"))
        assertTrue("the accent ring + halo only for accent", action.contains("if (accent) Modifier.drawBehind") && action.contains("if (accent) ExploreV3.Purple else ExploreV3.GlassBorder"))
        assertTrue("48dp tap floor kept", action.contains("defaultMinSize(minWidth = TappyMinTouchTarget, minHeight = TappyMinTouchTarget)"))
        val more2 = card.substring(card.indexOf("private fun RailMore("), card.indexOf("private fun ReviewPlacePill("))
        assertTrue("More holds Save/Unsave, and Hide/Delete on an own post", more2.contains("R.string.reviews_action_unsave") && more2.contains("R.string.reviews_action_save") && more2.contains("if (isMe) {") && more2.contains("R.string.reviews_overflow_delete_post"))
    }

    // ── shell integration ─────────────────────────────────────────────────

    @Test
    fun `the shell makes the Explore landing immersive and floats the glass dock on the Explore tab`() {
        assertTrue(shell.contains("containerColor = if (currentTab == HomeTab.Explore) ExploreV3.Background else MaterialTheme.colorScheme.background"))
        assertTrue("the landing, not nested Explore screens", shell.contains("val isExploreImmersive = currentTab == HomeTab.Explore && pastLandingByTab[HomeTab.Explore] != true"))
        assertTrue("no top inset on the landing", shell.contains("if (chatImmersive || isExploreImmersive) WindowInsets(0, 0, 0, 0)"))
        assertTrue("the feed takes the whole surface", shell.contains("modifier = if (isExploreImmersive) Modifier else Modifier.padding(innerPadding),"))
        assertTrue("the dock on the Explore tab, the same items and onSelect", shell.contains("currentTab == HomeTab.Explore -> ExploreFloatingDock(") && shell.contains("onSelect = { index -> navController.selectTab(HomeTab.entries[index]) },"))
        assertTrue("Hỏi Tappy rides the existing Chat-with-prefill bridge", shell.contains("onAskTappy = { prefill -> navController.navigateToChatWithPrefill(prefill) },"))
        val tabs = src("app/src/main/java/com/tappyai/app/home/HomeTab.kt")
        assertTrue("the five-tab shell is untouched", tabs.contains("Explore(HomeRoute.Explore, R.string.home_tab_explore, Icons.Filled.Explore),"))
        assertTrue(tabs.contains("Deals(HomeRoute.Deals, R.string.home_tab_deals, Icons.Filled.LocalOffer),"))
        val dock = src("app/src/main/java/com/tappyai/app/explore/ExploreFloatingDock.kt")
        assertTrue("glass, rounded, bordered, lifted", dock.contains(".background(ExploreV3.Glass)") && dock.contains("RoundedCornerShape(28.dp)") && dock.contains("ExploreV3.DockLift") && dock.contains(".navigationBarsPadding()"))
        assertTrue("active item in the accent with a halo", dock.contains("if (selected) ExploreV3.Glow else Color.Transparent"))
        assertTrue("tab role for accessibility", dock.contains("role = Role.Tab"))
    }

    @Test
    fun `Explore is the night palette regardless of the system appearance`() {
        val palette = src("app/src/main/java/com/tappyai/app/explore/ExploreV3.kt")
        assertTrue(palette.contains("val Background = Color(0xFF050814)"))
        assertTrue(palette.contains("val Purple = Color(0xFF7C5CFF)"))
        assertFalse("not read through Home's theme local", palette.contains("LocalV3Palette"))
    }
}
