package com.tappyai.app.chat

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Found on a real SM-A127F (360dp): the three-up "where" tiles ("Quận trung tâm / Quanh nhà / Khu
 * khác") printed "Quậ n tr…" — a 10dp pad, 24dp icon, 13.5sp label and `maxLines = 2` left ~31dp for
 * the text. Web final (`src/components/chat/AskCard.tsx` at a43948d) lays the icon-beside-label tile
 * out as `px-2`, a 20px icon, a 12.5px `leading-tight` label with NO line clamp.
 *
 * The contract pinned here is the one that keeps the label whole: the icon-beside-label branch must
 * not clamp its lines, must not use the wide 10dp/24dp/13.5sp metrics, and must not shorten the text.
 */
class AskCardTileLayoutTest {

    private fun askCardSource(): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            for (base in listOf("app/src/main/java", "src/main/java")) {
                val f = File(dir, "$base/com/tappyai/app/chat/AskCard.kt")
                if (f.exists()) return f.readText()
            }
            dir = dir.parentFile
        }
        error("AskCard.kt not found")
    }

    /** The `else` (icon beside label) branch of IconTile, up to the check badge. */
    private fun besideBranch(): String {
        val src = askCardSource()
        val start = src.indexOf("Web final's icon-beside-label tile")
        check(start > 0) { "icon-beside-label branch marker missing" }
        val end = src.indexOf("if (on) CheckBadge", start)
        // Code only: the comment above the branch quotes the old metrics on purpose.
        return src.substring(start, end).lines().filterNot { it.trimStart().startsWith("//") }.joinToString("\n")
    }

    @Test
    fun `the icon-beside-label label wraps instead of clamping`() {
        val branch = besideBranch()
        assertFalse("no maxLines on the label", branch.contains("maxLines"))
        assertFalse("no ellipsis on the label", branch.contains("TextOverflow.Ellipsis"))
    }

    @Test
    fun `the tile uses web final metrics`() {
        val branch = besideBranch()
        assertTrue("px-2 = 8dp", branch.contains("padding(horizontal = 8.dp"))
        assertTrue("h-5 w-5 icon", branch.contains("Modifier.size(20.dp)"))
        assertTrue("12.5px label", branch.contains("fontSize = 12.5.sp"))
    }

    @Test
    fun `the label text is never shortened`() {
        val branch = besideBranch()
        assertFalse(branch.contains(".take("))
        assertFalse(branch.contains("substring"))
        assertTrue(branch.contains("o.label.noWrapHyphen()"))
    }
}
