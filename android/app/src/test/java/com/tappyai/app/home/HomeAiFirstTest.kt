package com.tappyai.app.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

/**
 * P4-11 — the AI-first Home on Android (DD-002 / OD-1), and the limits the owner put on it.
 *
 * Three rules:
 *   1. asking Tappy is the primary action and comes FIRST;
 *   2. Home is NOT Chat — it renders no thread and streams nothing; every entry navigates;
 *   3. no tool was removed to make either of those true.
 *
 * Asserted against the composable's source rather than through a Compose UI test, for the same
 * reason the web wiring test does: `HomeScreen` is wired to a Hilt ViewModel, resource resolution
 * and a nested NavController, and a Robolectric harness for it would mostly exercise the mocks.
 * This project has been bitten by Robolectric false-greens before. Section ORDER, which is the
 * whole of what P4-11 changed, is exactly what a source read can establish honestly.
 */
class HomeAiFirstTest {

    private val source: String by lazy {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val f = File(dir, "app/src/main/java/com/tappyai/app/home/HomeScreen.kt")
            if (f.isFile) return@lazy f.readText()
            dir = dir.parentFile
        }
        fail("HomeScreen.kt not found above ${File(".").absolutePath}")
        error("unreachable")
    }

    /** Index of a section call in the composable body, or -1. */
    private fun at(section: String): Int = source.indexOf("$section(")

    @Test
    fun `asking Tappy comes before the tools`() {
        val hero = at("HomeHero")
        val suggestions = at("SuggestionsSection")
        val firstTool = listOf("FortuneSection", "ScanSection", "TappyTogetherSection", "ToolsSection")
            .map { at(it) }.filter { it >= 0 }.minOrNull() ?: -1

        assertTrue("the hero must exist", hero >= 0)
        assertTrue("the suggestions must exist", suggestions >= 0)
        assertTrue("the tools must still be on Home", firstTool >= 0)
        assertTrue("the hero comes first", hero < suggestions)
        assertTrue("suggestions come before the tool grid", suggestions < firstTool)
    }

    @Test
    fun `Continue comes before the tools too`() {
        val recent = at("RecentActivitySection")
        val firstTool = listOf("FortuneSection", "ScanSection", "TappyTogetherSection", "ToolsSection")
            .map { at(it) }.filter { it >= 0 }.minOrNull() ?: -1
        assertTrue("a returning user mostly resumes", recent >= 0)
        assertTrue("Continue must not sit below every tool on the page", recent < firstTool)
    }

    @Test
    fun `no tool was removed to make Home AI-first`() {
        // The inventory the approved design promised to preserve. A future tidy-up that drops one
        // fails here rather than in production.
        val required = listOf(
            "FortuneSection",
            "ScanSection",
            "TappyTogetherSection",
            "RecommendationsAndMusicSection",
            "ToolsSection",
            "ContentWriterSection",
            "CategoryChipsSection",
        )
        val missing = required.filter { at(it) < 0 }
        assertEquals("DD-002: tools are de-emphasised, never removed", emptyList<String>(), missing)
    }

    @Test
    fun `Home is not Chat — it navigates rather than rendering a thread`() {
        // The hero's action is a tab navigation, not an inline send.
        assertTrue(
            "the hero must navigate to the Chat tab",
            source.contains("onOpenChat = { onNavigateToTab(HomeTab.Chat) }"),
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
