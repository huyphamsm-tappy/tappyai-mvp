package com.tappyai.app.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * The AI-first Home on Android — the V3 contract (approved master mockup, 2026-09-06), carrying
 * forward the limits the owner put on Home at P4-11 (DD-002 / OD-1).
 *
 * Three rules, unchanged since P4-11:
 *   1. asking Tappy is the primary action and comes FIRST;
 *   2. Home is NOT Chat — it renders no thread and streams nothing; every entry navigates;
 *   3. no tool was removed to make either of those true.
 *
 * What changed at V3 is the SHAPE those rules take. The hero is `V3HeroSection` + `V3AskBar`
 * (not `HomeHero`); the tools that P4-11 kept as separate sections (Scan, Content Writer, Music,
 * Tappy Together) are now TILES of one `SmartToolsSection` at the foot of the page; and Fortune is
 * part of the discovery content in the middle of the page, not a tool. So this test asserts the
 * rules against the V3 sections and the V3 order, and no longer looks for the P4-11 section names.
 *
 * Asserted against the composable's source rather than through a Compose UI test, for the same
 * reason the web wiring test does: `HomeScreen` is wired to a Hilt ViewModel, resource resolution
 * and a nested NavController, and a Robolectric harness for it would mostly exercise the mocks.
 * This project has been bitten by Robolectric false-greens before. Section ORDER and section
 * INVENTORY are exactly what a source read can establish honestly.
 */
class HomeAiFirstTest {

    private val source: String by lazy {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, "app/src/main/java/com/tappyai/app/home/HomeScreen.kt")
            // Normalize CRLF → LF: on Windows worktrees the file is checked out with \r\n, and the
            // raw-source scans below (`indexOf("\n}\n", …)`) key off bare LF.
            if (f.isFile) return@lazy f.readText().replace("\r\n", "\n")
            dir = dir.parentFile
        }
        fail("HomeScreen.kt not found above ${File(".").absolutePath}")
        error("unreachable")
    }

    /**
     * The body of the `HomeScreen` composable only — the call sites, in render order. Reading the
     * whole file would also match each section's DEFINITION further down, which says nothing about
     * where it renders.
     */
    private val body: String by lazy {
        val start = source.indexOf("fun HomeScreen(")
        assertTrue("HomeScreen composable must exist", start >= 0)
        val end = source.indexOf("\n}\n", start)
        assertTrue("HomeScreen composable must close", end > start)
        source.substring(start, end)
    }

    /** Index of a section CALL in the composable body, or -1. Whole-name match, so `ToolsSection` cannot hit `SmartToolsSection`. */
    private fun at(section: String): Int =
        Regex("""(?<![A-Za-z0-9_])${Regex.escape(section)}\(""").find(body)?.range?.first ?: -1

    /** Every section call in the body, in render order. */
    private fun renderOrder(): List<String> =
        Regex("""(?<![A-Za-z0-9_])([A-Z][A-Za-z0-9]*(?:Section|Bar|Banner))\(""").findAll(body)
            .map { it.groupValues[1] }.toList()

    /** The source of one private section composable (its definition, not its call). */
    private fun definitionOf(section: String): String {
        val start = source.indexOf("private fun $section(")
        assertTrue("$section must be defined in HomeScreen.kt", start >= 0)
        val end = source.indexOf("\n}\n", start)
        return source.substring(start, if (end > start) end else source.length)
    }

    // ── Rule 1: asking Tappy comes first ────────────────────────────────────────────────────

    @Test
    fun `asking Tappy is the first thing on Home`() {
        val hero = at("V3HeroSection")
        val ask = at("V3AskBar")
        val quick = at("V3QuickSuggestionsSection")

        assertTrue("the V3 hero must exist", hero >= 0)
        assertTrue("the ask bar must exist", ask >= 0)
        assertTrue("the quick suggestions must exist", quick >= 0)
        // The primary AI block, in the mockup's order: greeting, then the ask box, then the prompt
        // pills that belong to the ask interaction.
        assertTrue("the hero comes first", hero < ask)
        assertTrue("the ask bar precedes the quick suggestions", ask < quick)
        // Nothing renders above the hero.
        assertEquals("the hero is the first section rendered", "V3HeroSection", renderOrder().first())
    }

    @Test
    fun `the tools are the last section, below every content section`() {
        val tools = at("SmartToolsSection")
        assertTrue("the tools must still be on Home", tools >= 0)
        assertEquals("the tool drawer closes the page", "SmartToolsSection", renderOrder().last())
        // The AI block and the content sections all sit above it — including Continue.
        for (section in listOf(
            "V3AskBar", "V3QuickSuggestionsSection", "V3RecommendationsSection",
            "CategoryChipsSection", "FortuneSection", "SuggestionsSection", "RecentActivitySection",
        )) {
            val index = at(section)
            assertTrue("$section must exist", index >= 0)
            assertTrue("$section must not sit below the tool drawer", index < tools)
        }
    }

    @Test
    fun `personalization leads the content, and Fortune is discovery rather than a tool`() {
        val quick = at("V3QuickSuggestionsSection")
        val recommendations = at("V3RecommendationsSection")
        val fortune = at("FortuneSection")
        val tools = at("SmartToolsSection")

        // "Gợi ý dành cho bạn" is the first content section after the AI block: what Tappy has
        // picked for this person outranks any catalogue of features.
        assertTrue("recommendations must exist", recommendations >= 0)
        assertTrue("recommendations follow the AI block", quick < recommendations)
        // Fortune stays on Home as part of the discovery run between the recommendations and the
        // tools. It is deliberately NOT classed as a tool, so no ordering against Continue applies.
        assertTrue("Fortune must exist", fortune >= 0)
        assertTrue("Fortune sits inside the discovery content", fortune in (recommendations + 1) until tools)
    }

    // ── Rule 3: no tool was removed ─────────────────────────────────────────────────────────

    @Test
    fun `no tool was removed to make Home AI-first`() {
        // DD-002: the tools P4-11 kept as their own sections now live as tiles of one drawer. The
        // inventory is the same; a tidy-up that drops one fails here rather than in production.
        val drawer = definitionOf("SmartToolsSection")
        val required = mapOf(
            "Scan" to "home_scan_title",
            "Content Writer" to "home_content_writer_title",
            "Music" to "home_music_title",
            "Tappy Together" to "home_together_title",
            // Canonical since D-series: Home is the entry to Scam Shield, and it must stay one.
            "Scam Shield" to "home_scam_shield_title",
        )
        val missing = required.filter { (_, key) -> !drawer.contains("R.string.$key") }.keys.toList()
        assertEquals("DD-002: tools are de-emphasised, never removed", emptyList<String>(), missing)

        // The discovery sections P4-11 also promised to keep.
        val missingSections = listOf("FortuneSection", "CategoryChipsSection").filter { at(it) < 0 }
        assertEquals("discovery sections are kept", emptyList<String>(), missingSections)
    }

    // ── Rule 2: Home is not Chat ────────────────────────────────────────────────────────────

    @Test
    fun `Home is not Chat — it navigates rather than rendering a thread`() {
        // The ask bar's action is a tab navigation, not an inline send.
        assertTrue(
            "the ask bar must navigate to the Chat tab",
            body.contains("V3AskBar(onClick = { onNavigateToTab(HomeTab.Chat) })"),
        )
        // None of the chat rendering surfaces belong on Home.
        for (forbidden in listOf("TappyChatBubble", "ChatResponseParser", "streamingText", "TypingIndicator")) {
            assertTrue(
                "Home must not render the conversation itself (found $forbidden)",
                !source.contains(forbidden),
            )
        }
    }

    @Test
    fun `For You is absent rather than empty`() {
        // ND-001: when no existing source can fill the section it is HIDDEN, never padded with
        // placeholder or invented content. Android has no source wired, so there must be no
        // section — and in particular no hard-coded sample items.
        assertTrue(
            "an unbacked For You section must not be rendered at all",
            !source.contains("ForYouSection("),
        )
    }
}
