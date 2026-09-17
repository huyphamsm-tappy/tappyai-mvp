package com.tappyai.app.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The V3 hero greeting contract, restored 2026-09-14 after the regression audit:
 *
 *  - the heading is the pre-V3 time-of-day engine ([HomeGreeting] via [HomeViewModel.greeting]),
 *    read on each composition of Home in the resolved resources' language — never a static line;
 *  - the V3 welcome stays and is the anchor: "Hi {name}! 👋" (`home_v3_greeting_named`) above the
 *    engine's two lines when a real display name is known, the guest line "Chào bạn! 👋"
 *    (`home_v3_greeting_generic`) otherwise — never "Hi null", never an invented name;
 *  - the engine's text is never edited by the adapter ([heroGreeting]): line 1 → title, line 2 →
 *    supporting, verbatim.
 *
 * The engine's own pools, weekend variants and rotation are pinned by [HomeGreetingTest]; here the
 * seven slot boundaries are checked as a contract, without pinning any template's wording.
 */
class HomeGreetingContractTest {

    private fun src(rel: String): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, rel)
            if (f.isFile) return f.readText().replace("\r\n", "\n").replace(Regex("(?m)^\\s*//.*$"), "")
            dir = dir.parentFile
        }
        error("$rel not found")
    }

    private val screen get() = src("app/src/main/java/com/tappyai/app/home/HomeScreen.kt")
    private val named: (String) -> String = { "Hi $it! 👋" }
    private val generic: () -> String = { "Chào bạn! 👋" }

    // ── 1–2: the dynamic engine is what the V3 hero consumes ──

    @Test
    fun `the V3 hero consumes the time-of-day engine through HomeViewModel greeting, in the resources' language`() {
        assertTrue("engine read on composition", screen.contains("val engineGreeting = viewModel.greeting(booleanResource(R.bool.resources_are_english))"))
        assertTrue("adapter lays it into the hero: name line from the V3 named string, guest line from the V3 guest string",
            screen.contains("named = { name -> resources.getString(R.string.home_v3_greeting_named, name) },") && screen.contains("generic = { resources.getString(R.string.home_v3_greeting_generic) },"))
        assertTrue(screen.contains("V3HeroSection(hero = hero)") && screen.contains("private fun V3HeroSection(hero: HeroGreeting)"))
        val hero = screen.substring(screen.indexOf("private fun V3HeroSection(hero: HeroGreeting)"), screen.indexOf("private fun BoxScope.Sparkle("))
        assertTrue("title = engine line 1", hero.contains("text = hero.title,"))
        assertTrue("supporting = engine line 2 (tagline only as a fallback)", hero.contains("text = hero.supporting ?: stringResource(R.string.home_v3_hero_tagline),"))
        assertTrue("the welcome line is the anchor (36sp) above the engine title (24sp) and supporting line (16sp)", hero.contains("text = hero.welcome,") && hero.indexOf("text = hero.welcome,") < hero.indexOf("text = hero.title,") && hero.contains("fontSize = 36.sp") && hero.contains("fontSize = 24.sp") && hero.contains("fontSize = 16.sp"))
        assertFalse("the engine line is no longer a 30sp headline", hero.contains("fontSize = 30.sp"))
        assertTrue("engine still the web port", src("app/src/main/java/com/tappyai/app/home/HomeViewModel.kt").contains("return HomeGreeting.heroText("))
        assertTrue("the V3 composition: mascot, glow, sparkles, the content-sized hero (min 212dp)", hero.contains("painterResource(R.drawable.tappy_wave)") && hero.contains("HomeV3.HeroGlow") && hero.contains("Sparkle(size = 12.dp") && hero.contains(".heightIn(min = 212.dp)"))
        assertFalse("no timer/tick was added (pre-V3 contract: evaluated on composition)", screen.contains("delay(") || screen.contains("LaunchedEffect(Unit) {\n        while"))
    }

    // ── 3–5: the adapter — guest, name, blank ──

    @Test
    fun `guest gets the guest welcome and the engine's two lines`() {
        val h = heroGreeting("Chào buổi sáng!\nHôm nay ăn gì ngon đây? ☀️", null, named, generic)
        assertEquals("Chào bạn! 👋", h.welcome)
        assertEquals("Chào buổi sáng!", h.title)
        assertEquals("Hôm nay ăn gì ngon đây? ☀️", h.supporting)
    }

    @Test
    fun `a known name makes the welcome Hi name and leaves the engine text untouched`() {
        val h = heroGreeting("Ngày mới bắt đầu —\nTappy sẵn sàng giúp bạn! 🌅", "Huy", named, generic)
        assertEquals("Hi Huy! 👋", h.welcome)
        assertEquals("Ngày mới bắt đầu —", h.title)
        assertEquals("Tappy sẵn sàng giúp bạn! 🌅", h.supporting)
    }

    @Test
    fun `a blank or whitespace name is a guest - never Hi null, never Hi blank`() {
        for (bad in listOf("", "   ", "\t")) {
            val h = heroGreeting("Còn thức à?\nĐặt đồ ăn khuya hay cần gì? 🍜", bad, named, generic)
            assertEquals("'$bad' must not personalise", "Chào bạn! 👋", h.welcome)
        }
        val h = heroGreeting("Còn thức à?\nĐặt đồ ăn khuya hay cần gì? 🍜", "  Huy  ", named, generic)
        assertEquals("Hi Huy! 👋", h.welcome)
        assertFalse(h.welcome.contains("null"))
    }

    @Test
    fun `a one-line template has no supporting line (the hero then shows the tagline)`() {
        val h = heroGreeting("Good morning!", "Huy", named, generic)
        assertEquals("Good morning!", h.title)
        assertNull(h.supporting)
    }

    @Test
    fun `every engine template splits into a title and a supporting line`() {
        for (hour in 0..23) for (weekend in listOf(false, true)) for (dom in 1..31) for (en in listOf(false, true)) {
            val h = heroGreeting(HomeGreeting.heroText(hour, weekend, dom, en), null, named, generic)
            assertTrue(h.title.isNotBlank()); assertTrue("$hour/$weekend/$dom/$en", !h.supporting.isNullOrBlank())
        }
    }

    // ── 6: EN / VI ──

    @Test
    fun `the english flag selects the English pool and the screen takes it from the resolved resources`() {
        val vi = HomeGreeting.heroText(hour = 7, isWeekend = false, dayOfMonth = 3, english = false)
        val en = HomeGreeting.heroText(hour = 7, isWeekend = false, dayOfMonth = 3, english = true)
        assertNotEquals(vi, en)
        assertTrue(src("app/src/main/res/values/bools_language.xml").contains("<bool name=\"resources_are_english\">true</bool>"))
        assertTrue(src("app/src/main/res/values-vi/bools_language.xml").contains("<bool name=\"resources_are_english\">false</bool>"))
    }

    // ── 7–9: the seven slots, their boundaries, weekend and rotation stay exactly the old contract ──

    @Test
    fun `the seven slots - constant inside a slot, different across each boundary - at 5, 9, 11, 14, 17 and 20`() {
        val starts = listOf(0, 5, 9, 11, 14, 17, 20)
        val ends = listOf(4, 8, 10, 13, 16, 19, 23)
        for (en in listOf(false, true)) for (dom in listOf(1, 2, 3)) {
            for (i in starts.indices) {
                val a = HomeGreeting.heroText(starts[i], false, dom, en)
                for (h in starts[i]..ends[i]) assertEquals("hour $h stays in slot ${starts[i]}", a, HomeGreeting.heroText(h, false, dom, en))
                if (i > 0) assertNotEquals("boundary at ${starts[i]}", HomeGreeting.heroText(starts[i] - 1, false, dom, en), a)
            }
        }
        assertEquals("unknown hour → the [5,9) pool", HomeGreeting.heroText(5, false, 9, false), HomeGreeting.heroText(99, false, 9, false))
    }

    @Test
    fun `weekend variants only in 5-9 and 17-20, day-of-month rotation everywhere`() {
        for (slot in listOf(0, 9, 11, 14, 20)) assertEquals("slot $slot ignores the weekend", HomeGreeting.heroText(slot, false, 6, false), HomeGreeting.heroText(slot, true, 6, false))
        for (slot in listOf(5, 17)) assertNotEquals("slot $slot has a weekend pool", HomeGreeting.heroText(slot, false, 1, false), HomeGreeting.heroText(slot, true, 1, false))
        assertNotEquals("rotates across days", HomeGreeting.heroText(15, false, 1, false), HomeGreeting.heroText(15, false, 2, false))
    }
}
