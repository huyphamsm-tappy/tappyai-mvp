package com.tappyai.app.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Smart Tools, web parity (2026-09-13): the registry, the card and the page mirror
 * `src/lib/tools/registry.ts` and `SmartToolCard.tsx` / `ToolsView.tsx` (design/v3-phase4).
 *
 * The registry and the pure search rule run for real; the web registry file is READ from the
 * repo so the order/groups/flags are compared against the source of truth, not a copy; the card,
 * the page and the wiring are pinned by source (Compose + NavController screens, as the sibling
 * tests do). The mascot drawables are checked byte-for-byte against `public/tappy/<pose>.png`.
 */
class SmartToolsTest {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }

    private fun src(rel: String): String = File(root(), rel).readText().replace(Regex("(?m)^\\s*//.*$"), "")
    private fun repo(rel: String): File = File(root().parentFile, rel)

    private val registry get() = src("app/src/main/java/com/tappyai/app/home/SmartTools.kt")
    private val screen get() = src("app/src/main/java/com/tappyai/app/home/SmartToolsScreen.kt")
    private val host get() = src("app/src/main/java/com/tappyai/app/home/HomeTabHost.kt")
    private val home get() = src("app/src/main/java/com/tappyai/app/home/HomeScreen.kt")

    // ── the registry is the web's ──

    @Test
    fun `the nine tools, their order, groups, Home flags and sign-in flags are the web registry's minus suggest`() {
        val web = repo("src/lib/tools/registry.ts").readText()
        val rows = Regex("""\{ id: '(\w+)', href: '([^']+)'.*?group: 'v3\.tools\.(\w+)', home: (true|false)(, auth: true)? \}""")
            .findAll(web).map { m -> listOf(m.groupValues[1], m.groupValues[3], m.groupValues[4], (m.groupValues[5].isNotEmpty()).toString()) }.toList()
        assertEquals("ten rows on the web", 10, rows.size)
        // 🔑 Android drops exactly `suggest` (Home already has "Gợi ý cho bạn"); every other row, in
        // the web's order, with the web's group and flags.
        val ours = SMART_TOOLS.map { listOf(it.id.name.lowercase(), it.group.name.lowercase(), it.home.toString(), it.auth.toString()) }
        assertEquals(rows.filter { it[0] != "suggest" }, ours)
        assertEquals(9, SMART_TOOLS.size)
        assertEquals(listOf("scan", "translate", "currency", "split", "safety", "together", "music", "fortune", "captions"), SMART_TOOLS.map { it.id.name.lowercase() })
        assertEquals(listOf("daily", "discover", "fun"), smartToolGroups().map { it.first.name.lowercase() })
        // SMART_TOOLS is the REGISTRY (9, web parity). `smartTools()` is what this build OFFERS:
        // Music is gated off on every platform while its licensing is open (ProductFlags.SHOW_MUSIC),
        // so Discover shows 1 of its 2. `smartToolGroups()` reads the gated list, as the web's does.
        assertEquals(listOf("together", "music"), SMART_TOOLS.filter { it.group == SmartToolGroup.Discover }.map { it.id.name.lowercase() })
        assertEquals(listOf(5, 1, 2), smartToolGroups().map { it.second.size })
        assertFalse("Music is not offered", smartTools().any { it.id == SmartToolId.Music })
        assertEquals(setOf(SmartToolId.Together), SMART_TOOLS.filter { it.auth }.map { it.id }.toSet())
    }

    @Test
    fun `there is no Gợi ý tool - not in the enum, the registry, the strings or the wiring - and its destination still serves Home`() {
        assertTrue(SmartToolId.entries.none { it.name == "Suggest" })
        assertFalse(registry.contains("smart_tool_suggest"))
        val vi = src("app/src/main/res/values-vi/strings_home.xml")
        val en = src("app/src/main/res/values/strings_home.xml")
        assertFalse("orphaned vi string", vi.contains("name=\"smart_tool_suggest"))
        assertFalse("orphaned en string", en.contains("name=\"smart_tool_suggest"))
        assertFalse("Smart Tools no longer routes to Recommendations", host.contains("SmartToolId.Suggest"))
        assertFalse(home.contains("SmartToolId.Suggest"))
        // The Recommendations screen is SHARED — Home's "Gợi ý cho bạn" still opens it — so it stays.
        assertTrue(host.contains("onOpenRecommendations = { navController.navigate(RecommendationsRoute.Main) }"))
        assertTrue(host.contains("composable<RecommendationsRoute.Main>"))
        assertTrue(src("app/src/main/java/com/tappyai/app/recommendations/RecommendationsRoute.kt").contains("data object Main : RecommendationsRoute"))
        // Home keeps its own "Gợi ý cho bạn" section, untouched.
        assertTrue(home.contains("private fun SuggestionsSection("))
        assertTrue(home.contains("SectionHeader(title = stringResource(R.string.home_section_suggested))"))
        assertTrue(vi.contains("<string name=\"home_section_suggested\">Gợi ý cho bạn</string>"))
    }

    @Test
    fun `searching gợi ý finds no tool, every remaining tool is still searchable, and a blank query is all nine`() {
        val titles = mapOf(
            SmartToolId.Scan to ("Quét" to "Quét hóa đơn, menu, văn bản"), SmartToolId.Translate to ("Dịch" to "Dịch nhanh hơn 100 ngôn ngữ"),
            SmartToolId.Currency to ("Tỷ giá" to "Quy đổi tiền tệ"), SmartToolId.Split to ("Chia bill" to "Chia tiền nhóm"),
            SmartToolId.Safety to ("Cảnh báo lừa đảo" to "Kiểm tra link, website mã QR an toàn"), SmartToolId.Together to ("Nhóm ăn" to "Chọn quán cùng nhau"),
            SmartToolId.Music to ("Nhạc" to "Thư viện nhạc"), SmartToolId.Fortune to ("Bói" to "Xem tử vi hôm nay"), SmartToolId.Captions to ("Viết" to "Viết caption"),
        )
        assertEquals(SMART_TOOLS.map { it.id }.toSet(), titles.keys)
        val hits = SMART_TOOLS.filter { val (t, d) = titles.getValue(it.id); matchesSmartToolQuery("gợi ý", t, d) }
        assertTrue("no Smart Tool answers to gợi ý", hits.isEmpty())
        for (tool in SMART_TOOLS) { val (t, d) = titles.getValue(tool.id); assertTrue(tool.id.name, matchesSmartToolQuery(t, t, d)) }
        assertEquals(9, SMART_TOOLS.count { val (t, d) = titles.getValue(it.id); matchesSmartToolQuery("", t, d) })
    }

    @Test
    fun `each tool wears the web skin - hue and mascot pose from SMART_TOOL_SKINS - and no pose is invented`() {
        val expected = mapOf(
            SmartToolId.Scan to (SmartToolHue.Blue to "searching"),
            SmartToolId.Translate to (SmartToolHue.Indigo to "speaking"),
            SmartToolId.Currency to (SmartToolHue.Emerald to "deals"),
            SmartToolId.Split to (SmartToolHue.Amber to "welcome"),
            SmartToolId.Safety to (SmartToolHue.Blue to "recommendation"),
            SmartToolId.Together to (SmartToolHue.Rose to "food"),
            SmartToolId.Music to (SmartToolHue.Cobalt to "aitools"),
            SmartToolId.Fortune to (SmartToolHue.Violet to "thinking"),
            SmartToolId.Captions to (SmartToolHue.Pink to "phone"),
        )
        for (tool in SMART_TOOLS) {
            val (hue, pose) = expected.getValue(tool.id)
            assertEquals(tool.id.name, hue, tool.hue)
            assertTrue("${tool.id} → tappy_$pose", Regex("""SmartToolId\.${tool.id.name},[^\n]*R\.drawable\.tappy_$pose,""").containsMatchIn(registry))
        }
        // The owner's pose library only — every mascot the cards use is one of the 18 files.
        val poses = Regex("""R\.drawable\.tappy_(\w+)""").findAll(registry).map { it.groupValues[1] }.toSet()
        val library = repo("public/tappy").listFiles()!!.filter { it.extension == "png" }.map { it.nameWithoutExtension }.toSet()
        assertTrue("unknown pose(s): ${poses - library}", library.containsAll(poses))
    }

    @Test
    fun `the mascot drawables are byte-identical copies of the official pose files`() {
        val poses = Regex("""R\.drawable\.tappy_(\w+)""").findAll(registry).map { it.groupValues[1] }.toSet()
        for (pose in poses) {
            val official = repo("public/tappy/$pose.png")
            val android = File(root(), "app/src/main/res/drawable-nodpi/tappy_$pose.png")
            assertTrue("$pose exists on Android", android.isFile)
            assertTrue("tappy_$pose.png is the official file, byte for byte", official.readBytes().contentEquals(android.readBytes()))
        }
    }

    @Test
    fun `the hues are the web's dark and light stops`() {
        // Spot-checked against globals.css `.dark .v3-toolcard[data-hue]` / `.v3-toolcard[data-hue]`.
        assertEquals(0xFF2563E6L, smartToolPalette(SmartToolHue.Blue, dark = true).a.value.toLong() ushr 32)
        assertEquals(0xFF0A1D52L, smartToolPalette(SmartToolHue.Blue, dark = true).b.value.toLong() ushr 32)
        assertEquals(0xFF3B82F6L, smartToolPalette(SmartToolHue.Blue, dark = true).badge.value.toLong() ushr 32)
        assertEquals(0xFF1F1200L, smartToolPalette(SmartToolHue.Amber, dark = true).badgeFg.value.toLong() ushr 32)
        assertEquals(0xFFE3EEFFL, smartToolPalette(SmartToolHue.Blue, dark = false).a.value.toLong() ushr 32)
        assertEquals(0xFFD63A75L, smartToolPalette(SmartToolHue.Pink, dark = false).badge.value.toLong() ushr 32)
        assertEquals("white glyphs elsewhere", 0xFFFFFFFFL, smartToolPalette(SmartToolHue.Rose, dark = true).badgeFg.value.toLong() ushr 32)
    }

    // ── the card ──

    @Test
    fun `the card is the web tile - badge glyph top-left, mascot top-right, title, description, sign-in hint as text, chevron - with a pressed state`() {
        val card = registry.substring(registry.indexOf("internal fun SmartToolCard("), registry.indexOf("internal fun SmartToolGrid("))
        assertTrue("135° a→b gradient", card.contains("Brush.linearGradient(listOf(palette.a, palette.b))"))
        assertTrue("18dp radius, 1dp light border", card.contains("RoundedCornerShape(18.dp)") && card.contains(".border(1.dp, border, shape)"))
        assertTrue("the glyph in a solid badge", card.contains(".background(palette.badge)") && card.contains("tint = palette.badgeFg"))
        assertTrue("the mascot, a real image in the corner", card.contains("painterResource(tool.mascotRes)") && card.contains(".align(Alignment.TopEnd)"))
        assertTrue("copy starts under the mascot", card.contains("Spacer(modifier = Modifier.height((mascot - badgeSize + 4.dp).coerceAtLeast(12.dp)))"))
        assertTrue("sign-in hint is text and an icon", card.contains("if (tool.auth) {") && card.contains("Icons.Filled.Lock") && card.contains("R.string.smart_tools_auth_hint"))
        assertTrue("the way in", card.contains("Icons.Filled.ChevronRight") && card.contains(".align(Alignment.BottomEnd)"))
        assertTrue("pressed: ripple + the web's active:scale(0.99)", card.contains("collectIsPressedAsState()") && card.contains(".scale(if (pressed) 0.99f else 1f)") && card.contains("indication = ripple(color = Color.White)"))
        assertTrue("the web's paint order: hue gradient, dark-only scrim, the sheen at 88%/8% behind the mascot", card.contains("if (dark) {") && card.contains("Color.Black.copy(alpha = 0.32f)") && card.contains("Offset(size.width * 0.88f, size.height * 0.08f)"))
        assertTrue("a soft drop shadow, like the web tile", card.contains(".shadow(elevation = 6.dp, shape = shape"))
        assertFalse("the chevron is bare, as on the web - no disc", card.contains("CircleShape"))
        assertTrue("web full-size metrics: 48dp badge / 22dp glyph / 88dp mascot / 180dp min", card.contains("val badgeSize = if (compact) 40.dp else 48.dp") && card.contains("val glyph = if (compact) 18.dp else 22.dp") && card.contains("val mascot = if (compact) 68.dp else 88.dp") && card.contains("val minHeight = if (compact) 150.dp else 180.dp"))
        assertTrue("two sizes, like the web", card.contains("val compact = variant == SmartToolCardVariant.Compact"))
        assertFalse("no generic Material card, no emoji glyphs", card.contains("TappyCard(") || card.contains("fontSize = 20.sp)") || Regex("""Text\("[^"]*[\p{So}]""").containsMatchIn(card))
    }

    // ── the page ──

    @Test
    fun `the page is a nested Home-tab screen with header, local search, the three groups and no invented actions`() {
        assertTrue(screen.contains("internal fun SmartToolsScreen(") && screen.contains("onOpen: (SmartToolId) -> Unit"))
        assertTrue("own back row + title + blurb", screen.contains("Icons.AutoMirrored.Filled.ArrowBack") && screen.contains("R.string.home_v3_smart_tools_title") && screen.contains("R.string.smart_tools_blurb"))
        assertTrue("search filters the offered tools locally", screen.contains("smartToolGroups(filterSmartTools(smartTools(), query))") && screen.contains("R.string.smart_tools_search_hint"))
        assertTrue("an empty match says so", screen.contains("R.string.smart_tools_search_empty"))
        assertTrue("groups in the web's order with the small-caps header", screen.contains("SmartToolsGroupHeader(title = stringResource(group.titleRes))") && screen.contains("title.uppercase()"))
        assertTrue("full-size cards on the page", screen.contains("variant = SmartToolCardVariant.Full"))
        assertFalse("no per-section Xem tất cả, no backend, no new tool", screen.contains("smart_tools_see_all") || screen.contains("Retrofit") || screen.contains("repository"))
        assertTrue("V3 palette, as Home", screen.contains("V3HomeTheme {") && screen.contains("HomeV3.Background"))
        assertFalse("no old generic tile", screen.contains("FeatureTile") || screen.contains("TappyCard("))
        // The pure rule.
        assertTrue(matchesSmartToolQuery("dịch", "Dịch", "Dịch nhanh hơn 100 ngôn ngữ"))
        assertTrue(matchesSmartToolQuery("QR", "An toàn", "Kiểm tra link, website mã QR an toàn"))
        assertFalse(matchesSmartToolQuery("tarot", "Bói", "Xem tử vi hôm nay theo cung hoàng đạo"))
        assertTrue("blank = everything", matchesSmartToolQuery("  ", "x", "y"))
    }

    @Test
    fun `the page is the web ToolsView - one frame, the 56dp badge header with the CTA, hairline group headers, one column of full tiles`() {
        assertTrue("`.v3-tools-frame`: panel, 24dp radius, 1dp border, 16dp padding, 32dp between blocks",
            screen.contains("val frameShape = RoundedCornerShape(24.dp)") && screen.contains(".background(HomeV3.Surface)") && screen.contains(".border(1.dp, HomeV3.Outline, frameShape)") && screen.contains("verticalArrangement = Arrangement.spacedBy(32.dp)"))
        val header = screen.substring(screen.indexOf("private fun SmartToolsHeader("), screen.indexOf("internal fun SmartToolsGroupHeader("))
        assertTrue("56dp accent badge, 18dp radius, the grid glyph at 28", header.contains(".size(56.dp)") && header.contains("RoundedCornerShape(18.dp)") && header.contains("Icons.Filled.GridView") && header.contains("Modifier.size(28.dp)"))
        assertTrue("26sp title reusing the nav's name, 13.5sp blurb", header.contains("fontSize = 26.sp") && header.contains("R.string.home_v3_smart_tools_title") && header.contains("fontSize = 13.5.sp") && header.contains("R.string.smart_tools_blurb"))
        assertTrue("the web's CTA pill: bordered, amber bulb tile, to Home", header.contains("R.string.smart_tools_cta") && header.contains("Icons.Outlined.Lightbulb") && header.contains("tint = HomeV3.BrandSpark") && header.contains(".clickable(onClick = onOpenHome)"))
        assertTrue("the CTA pops back to Home - the screen under this one", screen.contains("SmartToolsHeader(onOpenHome = onBack)"))
        val group = screen.substring(screen.indexOf("internal fun SmartToolsGroupHeader("), screen.indexOf("private fun filterSmartTools("))
        assertTrue("12.5sp bold tracked small caps + the hairline", group.contains("fontSize = 12.5.sp") && group.contains("letterSpacing = 1.75.sp") && group.contains("FontWeight.Bold") && group.contains("HorizontalDivider(color = HomeV3.Outline, modifier = Modifier.weight(1f))"))
        assertTrue("one column on a phone (`grid-cols-1` below sm), full tiles", screen.contains("SmartToolGrid(tools = tools, onOpen = onOpen, variant = SmartToolCardVariant.Full, columns = 1)"))
        assertTrue("the grid takes a column count; Home's rail keeps two", registry.contains("columns: Int = 2,") && home.contains("variant = SmartToolCardVariant.Compact") && !home.contains("columns = 1"))
        assertTrue("the search keeps its place, in the frame's tokens", screen.contains("shape = RoundedCornerShape(16.dp)") && screen.contains("unfocusedContainerColor = HomeV3.SurfaceVariant"))
    }

    @Test
    fun `Home stays clean and the bottom navigation is untouched`() {
        assertFalse("no Fortune section on Home", home.contains("FortuneSection(") || home.contains("home_section_fortune"))
        assertTrue("Fortune is a Smart Tools destination only", registry.contains("SmartTool(SmartToolId.Fortune,") && host.contains("SmartToolId.Fortune -> navController.navigate(FortuneRoute.Hub)"))
        assertTrue("the Home tab hosts the hub and its readings", listOf("Hub", "Tarot", "TuVi", "Zodiac").all { host.contains("composable<FortuneRoute.$it>") })
        val tabs = src("app/src/main/java/com/tappyai/app/home/HomeTab.kt")
        val order = Regex("""^\s{4}(Home|Chat|Explore|Deals|Profile)\(HomeRoute\.""", RegexOption.MULTILINE).findAll(tabs).map { it.groupValues[1] }.toList()
        assertEquals("Trang chủ | Chat | Khám phá | Deals | Tôi", listOf("Home", "Chat", "Explore", "Deals", "Profile"), order)
        assertTrue("the page is nested under Home, not a tab", src("app/src/main/java/com/tappyai/app/home/HomeTabRoute.kt").contains("data object SmartTools : HomeTabRoute") && !tabs.contains("SmartTools"))
    }

    @Test
    fun `every card opens the destination the Home tab already hosts, and Home reaches the page through Xem tất cả`() {
        val page = host.substring(host.indexOf("composable<HomeTabRoute.SmartTools>"), host.indexOf("composable<HomeTabRoute.GroupDining>"))
        val wiring = mapOf(
            "SmartToolId.Scan" to "ScanRoute.Main", "SmartToolId.Translate" to "TranslateRoute.Main", "SmartToolId.Currency" to "CurrencyRoute.Main",
            "SmartToolId.Split" to "SplitBillRoute.Main", "SmartToolId.Safety" to "ScamShieldRoute.Main",
            "SmartToolId.Together" to "HomeTabRoute.GroupDining", "SmartToolId.Music" to "MusicRoute.Library", "SmartToolId.Fortune" to "FortuneRoute.Hub",
            "SmartToolId.Captions" to "VietWriterRoute.Main",
        )
        for ((id, route) in wiring) {
            // Music's branch survives (the route table is one table) but is refused by the flag, so
            // its line reads `-> if (ProductFlags.SHOW_MUSIC) navController.navigate(...)`.
            val direct = "$id -> navController.navigate($route)"
            val gated = "$id -> if (ProductFlags.SHOW_MUSIC) navController.navigate($route)"
            assertTrue("$id → $route", page.contains(direct) || page.contains(gated))
        }
        assertTrue("Music is reached only behind the flag", page.contains("SmartToolId.Music -> if (ProductFlags.SHOW_MUSIC) navController.navigate(MusicRoute.Library)"))
        assertTrue(page.contains("onBack = { navController.popBackStack() }"))
        assertTrue("the landing's own callback", host.contains("onOpenSmartTools = { navController.navigate(HomeTabRoute.SmartTools) },"))
        assertTrue(src("app/src/main/java/com/tappyai/app/home/HomeTabRoute.kt").contains("data object SmartTools : HomeTabRoute"))
        val section = home.substring(home.indexOf("private fun SmartToolsSection("), home.indexOf("private fun V3DealsSection("))
        assertTrue("the section previews the offered cards, compact", section.contains("smartTools().filter { it.id in previewed }") && section.contains("variant = SmartToolCardVariant.Compact"))
        assertTrue("Xem tất cả → the page", section.contains("SectionLink(text = stringResource(R.string.smart_tools_see_all), onClick = onOpenSmartTools)"))
        assertEquals("the eight the section always showed, none dropped", 8, Regex("""SmartToolId\.\w+ -> onOpen(?!SmartTools)\w+\(\)""").findAll(section).count())
        assertFalse("the old hand-built tiles are gone", home.contains("private fun FeatureTile(") || home.contains("featureGradient("))
    }

    @Test
    fun `strings exist in both locales and the Vietnamese copy is the web's`() {
        val vi = src("app/src/main/res/values-vi/strings_home.xml")
        val en = src("app/src/main/res/values/strings_home.xml")
        val keys = Regex("""R\.string\.(smart_tool\w+)""").findAll(registry + screen + home).map { it.groupValues[1] }.toSet()
        assertTrue(keys.size >= 25)
        for (k in keys) {
            assertTrue("$k (vi)", vi.contains("name=\"$k\"")); assertTrue("$k (en)", en.contains("name=\"$k\""))
        }
        for (copy in listOf(">Quét<", ">Dịch<", ">Tỷ giá<", ">Chia bill<", ">Cảnh báo lừa đảo<", ">Nhóm ăn<", ">Nhạc<", ">Bói<", ">Viết<", ">Hằng ngày<", ">Khám phá<", ">Giải trí<", ">Cần đăng nhập<", ">Tìm công cụ…<", ">Làm nhiều hơn cùng TappyAI<", "Những công cụ hữu ích, được thiết kế để hỗ trợ bạn mỗi ngày")) {
            assertTrue(copy, vi.contains(copy))
        }
    }
}
