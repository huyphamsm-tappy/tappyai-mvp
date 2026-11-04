package com.tappyai.app.chat

import com.tappyai.app.chat.data.ChartPoint
import com.tappyai.app.chat.data.DocMediaItem
import com.tappyai.app.chat.data.ResearchChart
import com.tappyai.core.designsystem.component.markdownVisibleText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A4 (02/11): the answer reads like the web's article layout (web branch f4b07d2: src/lib/answerDoc/parse.ts, ArticleAnswer.tsx):
 *  - GFM tables are drawn as tables (before: raw "| a | b |" text);
 *  - citation numbers [1] [2] stay as written;
 *  - a picture goes under the heading, or the bold-lead list item, whose title is its title (titleKey: any script, accents and case aside);
 *    a picture whose title is not found is not shown; a section with a chart gets the chart.
 */
class ArticleLayoutTest {

    private val pic = { t: String -> DocMediaItem(t, "https://img.example/${t.length}.jpg", "web") }
    private val chart = { s: String -> ResearchChart(s, "Doanh số", "xe", "bar", listOf(ChartPoint("2024", 1.0, 1), ChartPoint("2025", 2.0, 1))) }

    @Test fun `a table reads as its cells, not as pipes and dashes`() {
        val md = "Bảng giá:\n\n| Mẫu | Giá |\n|---|:---:|\n| VF 3 | 240 triệu |\n| VF 5 | 460 triệu |\n\nHết."
        val seen = markdownVisibleText(md)
        assertEquals("Bảng giá:\nMẫu\tGiá\nVF 3\t240 triệu\nVF 5\t460 triệu\nHết.", seen)
        assertFalse(seen, "|" in seen || "---" in seen)
    }

    @Test fun `a lone pipe line is not a table`() {
        assertEquals("a | b", markdownVisibleText("a | b"))
        assertEquals("| a | b |", markdownVisibleText("| a | b |"))
    }

    @Test fun `citation numbers stay as written`() {
        assertEquals("Giá tăng 5% [1][2].", markdownVisibleText("Giá tăng 5% [1][2]."))
    }

    @Test fun `titleKey matches any script, accents and case aside`() {
        assertEquals("pho bo ha noi", titleKey("Phở Bò Hà Nội!"))
        assertEquals("duong sat", titleKey("Đường  sắt"))
        assertEquals(titleKey("1. Doanh số"), titleKey("1. DOANH SỐ"))
    }

    @Test fun `a picture goes under its heading (numbering and emoji aside) or its bold-lead item`() {
        val md = "# Báo cáo\n\nMở đầu.\n\n## 1. Doanh số\n\nBán 10 xe.\n\n## 2. Giá\n\n- **Phở bò** – nước dùng trong\n- **Bún chả** – than hoa\n\nKết."
        val parts = placeArticle(listOf(md), listOf(pic("Doanh số"), pic("Bún chả"), pic("Không có")), emptyList())
        val kinds = parts.map { when (it) { is ArticlePart.Markdown -> "md"; is ArticlePart.Picture -> "pic:" + it.item.title; is ArticlePart.Chart -> "chart" } }
        assertEquals(listOf("md", "pic:Doanh số", "md", "pic:Bún chả", "md"), kinds)
        assertTrue((parts[0] as ArticlePart.Markdown).text.trimEnd().endsWith("## 1. Doanh số"))
        assertTrue((parts[2] as ArticlePart.Markdown).text.trimEnd().endsWith("- **Bún chả** – than hoa"))
        // nothing is lost or repeated
        assertEquals(md.replace("\n", ""), parts.filterIsInstance<ArticlePart.Markdown>().joinToString("") { it.text }.replace("\n", ""))
    }

    // web: a charted section gets no picture
    @Test fun `a section with a chart gets the chart, not its picture, and each is used once`() {
        val md = "## Doanh số\n\nA.\n\n## Doanh số\n\nB.\n\n## Giá\n\nC.\n\n## Giá\n\nD."
        val parts = placeArticle(listOf(md), listOf(pic("Doanh số"), pic("Giá")), listOf(chart("Doanh số")))
        assertEquals(1, parts.count { it is ArticlePart.Chart })
        assertEquals(listOf("Giá"), parts.filterIsInstance<ArticlePart.Picture>().map { it.item.title })
    }

    @Test fun `no pictures, no charts - the text as it is`() {
        assertEquals(listOf(ArticlePart.Markdown("## A\n\nb")), placeArticle(listOf("## A\n\nb"), emptyList(), emptyList()))
    }

    @Test fun `the reply uses the layout, and says when the server marked it incomplete or interrupted`() {
        fun src(p: String) = File("src/main/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        val screen = src("java/com/tappyai/app/chat/ChatScreen.kt")
        assertTrue(screen.contains("ArticlePlacer(message.docMedia, message.charts)"))
        assertTrue(screen.contains("TurnStatusLine("))
        for (f in listOf("res/values/strings_chat.xml", "res/values-vi/strings_chat.xml")) {
            val xml = src(f)
            assertTrue(f, "name=\"chat_turn_incomplete\"" in xml && "name=\"chat_turn_interrupted\"" in xml)
        }
    }
}
