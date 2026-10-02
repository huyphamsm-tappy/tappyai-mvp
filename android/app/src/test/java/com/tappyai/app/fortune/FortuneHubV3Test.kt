package com.tappyai.app.fortune

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Xem bói hub in the V3 cosmic dress (2026-09-14, from web `BoiLandingView.tsx` on
 * design/v3-phase4). Source-pinned: the same three destinations in the same order through the
 * same callbacks and the same host wiring; the chips name only readings the sub-screens render;
 * the scene is drawn, never a bitmap and never emoji — exactly as the web hub, which has no
 * image asset either; the hero copy is the web's, in both languages.
 */
class FortuneHubV3Test {

    private fun root(): File = generateSequence(File(".").absoluteFile) { it.parentFile }
        .first { File(it, "app/src/main/java/com/tappyai/app").isDirectory }
    private fun src(rel: String): String = File(root(), rel).readText().replace("\r\n", "\n").replace(Regex("(?m)^\\s*//.*$"), "")
    private fun body(s: String): String = s.replace(Regex("(?s)/\\*\\*.*?\\*/"), "")

    private val screen get() = src("app/src/main/java/com/tappyai/app/fortune/FortuneHubScreen.kt")

    @Test
    fun `three destinations, in order, through the same callbacks - and the host wires the same routes`() {
        assertTrue("the same signature", screen.contains("fun FortuneHubScreen(\n    onBack: () -> Unit,\n    onOpenTarot: () -> Unit,\n    onOpenTuVi: () -> Unit,\n    onOpenZodiac: () -> Unit,\n)"))
        val features = screen.substring(screen.indexOf("val features = listOf("), screen.indexOf("V3HomeTheme {"))
        val order = Regex("""title = stringResource\(R\.string\.(fortune_hub_\w+_title)\)""").findAll(features).map { it.groupValues[1] }.toList()
        assertEquals(listOf("fortune_hub_tarot_title", "fortune_hub_tuvi_title", "fortune_hub_zodiac_title"), order)
        val clicks = Regex("""onClick = (onOpen\w+),""").findAll(features).map { it.groupValues[1] }.toList()
        assertEquals(listOf("onOpenTarot", "onOpenTuVi", "onOpenZodiac"), clicks)
        assertTrue("the whole card is the click target", screen.contains(".clickable(onClick = feature.onClick),"))
        assertTrue("back row", screen.contains("IconButton(onClick = onBack)") && screen.contains("R.string.fortune_hub_title"))

        val host = src("app/src/main/java/com/tappyai/app/home/HomeTabHost.kt")
        val hub = host.substring(host.indexOf("composable<FortuneRoute.Hub> {"), host.indexOf("composable<FortuneRoute.Tarot>"))
        assertTrue(hub.contains("onBack = { navController.popBackStack() },"))
        assertTrue(hub.contains("onOpenTarot = { navController.navigate(FortuneRoute.Tarot) },"))
        assertTrue(hub.contains("onOpenTuVi = { navController.navigate(FortuneRoute.TuVi) },"))
        assertTrue(hub.contains("onOpenZodiac = { navController.navigate(FortuneRoute.Zodiac) },"))
        assertTrue("Smart Tools still opens the same hub", host.contains("SmartToolId.Fortune -> navController.navigate(FortuneRoute.Hub)"))
    }

    @Test
    fun `the chips name only readings the sub-screens really render`() {
        val features = screen.substring(screen.indexOf("val features = listOf("), screen.indexOf("V3HomeTheme {"))
        val tarot = features.substring(0, features.indexOf("hue = FortuneHue.Amber"))
        assertEquals(
            listOf("fortune_tarot_past", "fortune_tarot_present", "fortune_tarot_future"),
            Regex("""R\.string\.(fortune_tarot_\w+)""").findAll(tarot).map { it.groupValues[1] }.toList(),
        )
        val readings = screen.substring(screen.indexOf("private fun readingChips()"), screen.indexOf("private data class FortuneFeature("))
        assertEquals(
            listOf("fortune_love", "fortune_career_life", "fortune_money", "fortune_health"),
            Regex("""R\.string\.(fortune_\w+)""").findAll(readings).map { it.groupValues[1] }.toList(),
        )
        assertEquals("both birth-date cards use them", 2, Regex("""chips = readingChips\(\),""").findAll(features).count())
        // The same labels the destinations draw.
        val tarotScreen = src("app/src/main/java/com/tappyai/app/fortune/tarot/TarotScreen.kt")
        for (k in listOf("fortune_tarot_past", "fortune_tarot_present", "fortune_tarot_future")) assertTrue(k, tarotScreen.contains("R.string.$k"))
        for (f in listOf("tuvi/TuViScreen.kt", "zodiac/ZodiacScreen.kt")) {
            val s = src("app/src/main/java/com/tappyai/app/fortune/$f")
            for (k in listOf("fortune_love", "fortune_career_life", "fortune_money", "fortune_health")) assertTrue("$f $k", s.contains("R.string.$k"))
        }
        // No mode the reference drew and the product lacks.
        for (fake in listOf("Hướng đi", "Công danh", "Vận may", "Tính cách", "Direction", "Fame", "Luck", "Personality")) {
            assertFalse(fake, body(screen).contains(fake))
        }
    }

    @Test
    fun `the scene is drawn like the web's CSS - no bitmap, no emoji, no mascot pose`() {
        val code = body(screen)
        assertFalse("no image asset in the hub", Regex("""painterResource|R\.drawable\.|AsyncImage|TappyImage|Image\(""").containsMatchIn(code))
        assertFalse("no emoji glyphs", Regex("[\\x{1F300}-\\x{1FAFF}\\x{2600}-\\x{27BF}]").containsMatchIn(code))
        assertTrue("three tarot plates carrying a star, a sun and a moon", Regex("""TarotPlate\(width = """).findAll(code).count() == 3 && code.contains("Icons.Outlined.StarOutline") && code.contains("Icons.Outlined.WbSunny") && code.contains("Icons.Outlined.DarkMode"))
        assertTrue("the three hues, verbatim from `.v3-boi-card[data-hue]`", code.contains("panelA = Color(0xFF14113A), panelB = Color(0xFF2A1B5E)") && code.contains("panelA = Color(0xFF1A1230), panelB = Color(0xFF3A2318)") && code.contains("panelA = Color(0xFF0B1633), panelB = Color(0xFF0E2A4F)"))
        assertTrue("one motif per hue", code.contains("FortuneMotif.Plate ->") && code.contains("FortuneMotif.Rings ->") && code.contains("FortuneMotif.Wheel ->"))
        assertTrue("V3 ground + the shared disclaimer", code.contains("V3HomeTheme {") && code.contains(".background(HomeV3.Background)") && code.contains("R.string.fortune_disclaimer"))
    }

    @Test
    fun `the hero copy is the web's, in both languages`() {
        val en = src("app/src/main/res/values/strings_fortune.xml")
        val vi = src("app/src/main/res/values-vi/strings_fortune.xml")
        for (k in listOf("fortune_hub_hero_eyebrow", "fortune_hub_hero_title_line1", "fortune_hub_hero_title_line2", "fortune_hub_hero_description")) {
            assertTrue("$k (en)", en.contains("name=\"$k\"")); assertTrue("$k (vi)", vi.contains("name=\"$k\""))
            assertTrue("$k used", screen.contains("R.string.$k"))
        }
        assertTrue(vi.contains(">Tò mò vận may<") && vi.contains(">hôm nay của bạn?<"))
        assertTrue(vi.contains(">Tarot, tử vi 12 con giáp và cung hoàng đạo — chỉ mang tính giải trí, tham khảo cho vui.<"))
        assertTrue(en.contains(">Wondering what today<") && en.contains(">has in store for you?<"))
        // The pre-existing hub copy is untouched.
        assertTrue(vi.contains(">Xem bói<") && vi.contains(">Rút bài Tarot<") && vi.contains(">Tử vi 12 con giáp<") && vi.contains(">Cung hoàng đạo<"))
    }
}
