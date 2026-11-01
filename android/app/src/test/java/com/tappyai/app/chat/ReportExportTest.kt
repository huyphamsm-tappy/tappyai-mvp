package com.tappyai.app.chat

import com.tappyai.app.chat.data.ChartPoint
import com.tappyai.app.chat.data.ResearchChart
import com.tappyai.app.chat.data.ResearchLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * A5 (02/11): the finished Deep Research report as a file the person keeps - Markdown and PDF on Android (owner: Word later) - built on the
 * phone from what is on screen, nothing sent anywhere (web: src/lib/answerDoc/reportExport.ts, reportChart.ts chartTable).
 */
class ReportExportTest {

    private val links = listOf(ResearchLink(1, "VnExpress – Xe điện", "https://vnexpress.net/a"), ResearchLink(2, "Nguồn [lạ]", "http://plain.example/"))
    private val report = "# Thị trường xe điện\n\n## 1. Doanh số\n\nBán 10 xe [1].\n\n## Nguồn\n\n1. VnExpress — vnexpress.net\n2. Plain — plain.example\n3. Không có — x"

    @Test fun `the file name - letters, digits, spaces and dashes, at most 60 characters`() {
        assertEquals("Thị trường xe điện 2025.md", reportFileName("Thị trường: xe điện / 2025?", "md"))
        assertEquals("report.pdf", reportFileName("***", "pdf"))
        assertEquals(60 + 3, reportFileName("a".repeat(100), "md").length)
    }

    @Test fun `markdown - the last section's numbered lines link to the card's https sources of the same number`() {
        val md = reportMarkdown(report, links)
        assertTrue(md, "1. [VnExpress – Xe điện](https://vnexpress.net/a)" in md)
        assertTrue(md, "2. Plain — plain.example" in md) // http is not linked
        assertTrue(md, "3. Không có — x" in md)
        assertTrue(md, "Bán 10 xe [1]." in md) // the body is as written
        assertTrue(md.endsWith("\n"))
    }

    @Test fun `each chart's figures become a table under its section, in the report's language`() {
        val chart = ResearchChart("Doanh số", "Doanh số theo năm", "xe", "bar", listOf(ChartPoint("2024", 1234.5, 1), ChartPoint("2025", 2000.0, 2)))
        val vi = withChartTables(report, listOf(chart), "vi")
        assertTrue(vi, "## 1. Doanh số\n\n| Mục | Giá trị |\n|---|---|\n| 2024 | 1.234,5 xe [1] |\n| 2025 | 2.000 xe [2] |\n\n*Biểu đồ: Doanh số theo năm*\n" in vi)
        val en = withChartTables(report, listOf(chart), "en")
        assertTrue(en, "| Item | Value |" in en && "| 2024 | 1,234.5 xe [1] |" in en)
        assertEquals(report, withChartTables(report, listOf(chart.copy(section = "Không có mục này")), "vi"))
    }

    @Test fun `the pdf reads the report block by block - headings apart, no markdown marks`() {
        val blocks = pdfBlocks("# Tiêu đề\n\nMột **đậm** và [link](https://a.example).\n\n- mục **một**\n\n| A | B |\n|---|---|\n| 1 | 2 |")
        assertEquals(listOf(PdfBlock(1, "Tiêu đề"), PdfBlock(0, "Một đậm và link."), PdfBlock(0, "• mục một"), PdfBlock(0, "A\tB\n1\t2")), blocks)
        assertFalse(blocks.any { "**" in it.text || "](" in it.text })
    }

    @Test fun `the research card is drawn live and on the reply, with the web's words`() {
        fun src(p: String) = File("src/main/$p").let { if (it.exists()) it else File("app/" + it.path) }.readText()
        val screen = src("java/com/tappyai/app/chat/ChatScreen.kt")
        assertTrue(screen.contains("streamingResearch?.let { live -> ResearchCard(status = live"))
        assertTrue(screen.contains("ResearchCard(status = research"))
        for (f in listOf("res/values/strings_chat.xml", "res/values-vi/strings_chat.xml")) {
            val xml = src(f)
            for (k in listOf("planning", "researching", "writing", "done", "failed", "sources", "download")) assertTrue("$f $k", "name=\"chat_research_$k\"" in xml)
        }
    }
}
