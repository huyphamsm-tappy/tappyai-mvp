package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Visual / copy parity pins against Web final `a43948d`, found by the screenshot-by-screenshot audit of 05/10 (Web at 412x915 vs the Android emulator):
 *  - the user's chat bubble: Web `ChatInterface.tsx` draws it `bg-interactive text-white rounded-2xl rounded-br-md px-4 py-2.5`, with
 *    `--interactive: 0 98 204` = #0062CC in `src/app/globals.css` — in light AND dark. Android used Material `primary`, a pale periwinkle in the dark scheme;
 *  - the Explore feed's "following" tab: the live Web feed reads `reviews.tabFollowing` (`src/lib/i18n/w2/reviews.ts`): vi «Đang follow», en «Following».
 */
class WebVisualParityTest {

    private fun file(rel: String): String {
        var dir: File? = File(System.getProperty("user.dir")!!).absoluteFile
        while (dir != null && !File(dir, "app/src/main").exists()) dir = dir.parentFile
        return File(dir!!, rel).readText()
    }

    @Test
    fun `the user bubble is the Web interactive blue with white text and the Web corners`() {
        val bubble = file("core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyChatBubble.kt")
        assertTrue("#0062CC", bubble.contains("Color(0xFF0062CC)"))
        assertTrue("rounded-2xl rounded-br-md", bubble.contains("RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomEnd = 6.dp, bottomStart = 16.dp)"))
        assertTrue("px-4 py-2.5", bubble.contains(".padding(horizontal = 16.dp, vertical = 10.dp)"))
        assertTrue("white text", bubble.contains("StyledMessageContent(color = Color.White, content = content)"))
        assertTrue("no Material primary on the user bubble", !bubble.substringAfter("TappyChatRole.User ->").substringBefore("TappyChatRole.Assistant ->").contains("colorScheme.primary"))
    }

    @Test
    fun `the quick chips above the composer have the Web dark variants - X-900 at 30 percent, X-400 text, X-800 border`() {
        val screen = file("app/src/main/java/com/tappyai/app/chat/ChatScreen.kt")
        // dark:bg-primary-900/30 text-primary-400 border-primary-800 (+ accent / blue / green), tailwind.config.ts @ a43948d
        for (pin in listOf(
            "Color(0xFF001833).copy(alpha = 0.30f), Color(0xFF3391FF), Color(0xFF003166)",
            "Color(0xFF331E00).copy(alpha = 0.30f), Color(0xFFFFA733), Color(0xFF663C00)",
            "Color(0xFF1E3A8A).copy(alpha = 0.30f), Color(0xFF60A5FA), Color(0xFF1E40AF)",
            "Color(0xFF14532D).copy(alpha = 0.30f), Color(0xFF4ADE80), Color(0xFF166534)",
        )) assertTrue(pin, screen.contains(pin))
        assertTrue("the palette follows the theme", screen.contains("palette.forTheme(isDark)") && screen.contains("MaterialTheme.colorScheme.background.luminance() < 0.5f"))
    }

    @Test
    fun `the Explore following tab says what the Web feed says`() {
        assertTrue(file("app/src/main/res/values-vi/strings_reviews.xml").contains("<string name=\"reviews_tab_following\">Đang follow</string>"))
        assertTrue(file("app/src/main/res/values/strings_reviews.xml").contains("<string name=\"reviews_tab_following\">Following</string>"))
        assertEquals("the other two tabs already match", 1, Regex("""<string name="reviews_tab_for_you">Đề xuất</string>""").findAll(file("app/src/main/res/values-vi/strings_reviews.xml")).count())
    }
}
