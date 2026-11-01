package com.tappyai.app.chat

import com.tappyai.app.chat.data.ResearchLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Review 01/11 (Android = the web). The web fixed its Deep Research files on 01/11 (PDF: a font that covers Vietnamese at 16 px / 1.75 with room
 * between blocks, "n / N" page numbers, bordered tables, sources with their addresses; Word: Calibri 11 pt, lines at about 1.4, sized headings, padded
 * tables). Android drew the PDF at 11 pt with the font's own line height, no page numbers, tables as tab-joined text and sources without addresses,
 * and had no Word file. The pure parts of the new layout are pinned here (the drawing itself needs a device).
 */
class ReportExportLayoutTest {
    private fun source(name: String) = File(generateSequence(File(".").absoluteFile) { it.parentFile }.first { File(it, "docs/uat/evidence").isDirectory }, "android/app/src/main/java/com/tappyai/app/chat/$name").readText()

    @Test fun `the PDF reads comfortably - body 12 pt or more, lines at 1_4 or more, headings above the body in order`() {
        assertTrue(PdfStyle.BODY >= 12f)
        assertTrue(PdfStyle.LINE_MULT >= 1.4f)
        assertTrue(PdfStyle.TITLE > PdfStyle.H1 && PdfStyle.H1 > PdfStyle.H2 && PdfStyle.H2 > PdfStyle.H3 && PdfStyle.H3 > PdfStyle.BODY)
        assertTrue(PdfStyle.MARGIN >= 56)
    }

    @Test fun `a markdown table is one table block with its header and rows, marks stripped and the separator dropped`() {
        val md = "## Doanh số\n\n| Hãng | Xe |\n|---|---|\n| **BYD** | 2,26 tr [1] |\n| Tesla | 1,64 tr |\n\nHết."
        val blocks = pdfBlocks(md)
        val table = blocks.single { it.rows != null }
        assertEquals(listOf(listOf("Hãng", "Xe"), listOf("BYD", "2,26 tr [1]"), listOf("Tesla", "1,64 tr")), table.rows)
        assertEquals(listOf("Doanh số", "Hết."), blocks.filter { it.rows == null }.map { it.text })
    }

    @Test fun `a block that is not a table has no rows`() {
        assertNull(pdfBlocks("Một đoạn thường.\n\n- một ý\n- ý hai").first().rows)
        assertNull(pdfBlocks("| chỉ một dòng có gạch đứng |").first().rows)
    }

    @Test fun `the sources list of the PDF carries each address`() {
        val text = "# Xe điện\n\n## Doanh số\nBYD dẫn đầu [1].\n\n### Nguồn\n1. BYD sales — byd.com\n2. Không có link — x.example\n"
        val out = reportForPdf(text, listOf(ResearchLink(1, "BYD [sales]", "https://byd.com/a"), ResearchLink(2, "bad", "javascript:alert(1)")))
        assertTrue(out.contains("1. BYD sales — https://byd.com/a"))
        assertTrue(out.contains("2. Không có link — x.example")) // no https address: stays as it is
        assertTrue(out.contains("BYD dẫn đầu [1]."))
    }

    @Test fun `the PDF blocks keep an address in the text - the chat's reader turns a bare address into a site name, a PDF has no link to tap`() {
        // seen on the emulator (01/11): the PDF's sources read "n. title — tilleke.com" with no address at all, because markdownVisibleText replaced it
        val text = "### Nguồn\n1. BYD sales — https://byd.com/a\n2. Báo — https://vnexpress.net/x?id=1&p=2"
        val block = pdfBlocks(reportForPdf(text, listOf(ResearchLink(1, "BYD sales", "https://byd.com/a")))).last()
        assertTrue(block.text, block.text.contains("https://byd.com/a"))
        assertTrue(block.text, block.text.contains("https://vnexpress.net/x?id=1&p=2"))
        // a link written as [label](url) in prose still reads as its label (the reader's own rule)
        assertEquals("Xem BYD.", pdfBlocks("Xem [BYD](https://byd.com/a).").single().text)
    }

    @Test fun `a heading is never left alone at the bottom of a page, and the page label reads n over N`() {
        val bottom = 700
        assertTrue(keepHeadingWithNext(y = 660, headingH = 30, nextLineH = 18, bottom = bottom)) // heading + two body lines do not fit: next page
        assertEquals(false, keepHeadingWithNext(y = 400, headingH = 30, nextLineH = 18, bottom = bottom))
        assertEquals("3 / 12", pageLabel(3, 12))
    }

    @Test fun `the research card offers Word beside Markdown and PDF, and the PDF gets the addresses`() {
        val card = source("ResearchCard.kt")
        assertTrue(card.contains("ExportButton(\"Word\")"))
        assertTrue(card.contains("writeReportDocx("))
        assertTrue(card.contains("reportForPdf("))
        assertNotNull(Regex("wordprocessingml\\.document").find(card))
    }
}
