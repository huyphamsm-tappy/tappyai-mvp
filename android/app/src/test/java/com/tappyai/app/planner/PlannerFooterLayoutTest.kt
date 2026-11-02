package com.tappyai.app.planner

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Found on a real SM-A127F (360dp): the Planner card footer printed "Cập nhật …" instead of
 * "Cập nhật 2 phút trước" — the label sat in a `Row` with `weight(1f)` + `maxLines = 1`, so the two
 * footer links took their natural width and the label got whatever was left. The footer is now a
 * `FlowRow`: the label keeps its natural width and the links wrap to the next line when they do not
 * fit beside it. No special-casing of any phrase.
 */
class PlannerFooterLayoutTest {

    private fun plannerSource(): String {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            for (base in listOf("app/src/main/java", "src/main/java")) {
                val f = File(dir, "$base/com/tappyai/app/planner/PlannerScreen.kt")
                if (f.exists()) return f.readText()
            }
            dir = dir.parentFile
        }
        error("PlannerScreen.kt not found")
    }

    private fun footer(): String {
        val src = plannerSource()
        val start = src.indexOf("A FlowRow, not a Row")
        check(start > 0) { "footer marker missing" }
        val end = src.indexOf("AnimatedVisibility(visible = open)", start)
        return src.substring(start, end)
    }

    @Test
    fun `the footer is a FlowRow so the label is never squeezed`() {
        val f = footer()
        assertTrue(f.contains("FlowRow("))
    }

    @Test
    fun `the updated label is neither weighted nor clamped nor ellipsized`() {
        val f = footer()
        val label = f.substring(f.indexOf("planner_last_activity"), f.indexOf("FooterLink("))
        assertFalse(label.contains("weight("))
        assertFalse(label.contains("maxLines"))
        assertFalse(label.contains("TextOverflow.Ellipsis"))
    }

    @Test
    fun `both footer links remain`() {
        val f = footer()
        assertTrue(f.contains("R.string.planner_expand"))
        assertTrue(f.contains("R.string.planner_open"))
    }
}
