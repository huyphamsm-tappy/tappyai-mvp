package com.tappyai.app.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipInputStream

/**
 * Review 01/11 (Android = the web): the Deep Research report as a Word file. Same look as the web's reportDocx.ts: Calibri 11 pt, lines at about
 * 1.4 (line 336), room after each paragraph, sized headings, padded and bordered table cells, "page / pages" in the footer, https links clickable.
 * Built with java.util.zip only, so it is tested here on the JVM by opening the file it writes.
 */
class ReportDocxTest {
    private val report = "# Xe điện 2026\nMở đầu có **đậm**, *nghiêng* và [BYD](https://byd.com/a).\n\n## Doanh số\n- BYD dẫn đầu\n- Tesla thứ hai\n\n1. Một\n2. Hai\n\n| Hãng | Xe |\n|---|---|\n| BYD | 2,26 tr |\n\n> trích dẫn\n\n### Nguồn\n1. [BYD sales](https://byd.com/a)\n"

    private fun parts(md: String = report, title: String = "Xe điện 2026"): Map<String, String> {
        val out = ByteArrayOutputStream()
        writeReportDocx(title, md, out)
        val zip = ZipInputStream(ByteArrayInputStream(out.toByteArray()))
        val map = LinkedHashMap<String, String>()
        generateSequence { zip.nextEntry }.forEach { map[it.name] = zip.readBytes().toString(Charsets.UTF_8) }
        return map
    }

    @Test fun `it is a Word package - the parts Word needs are all there`() {
        val p = parts()
        for (name in listOf("[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/footer1.xml", "word/_rels/document.xml.rels")) assertTrue(name, p.containsKey(name))
    }

    @Test fun `the document font covers Vietnamese at 11 pt with lines at about 1_4 and room after a paragraph`() {
        val styles = parts().getValue("word/styles.xml")
        assertTrue(styles.contains("w:ascii=\"Calibri\""))
        assertTrue(styles.contains("<w:sz w:val=\"22\"/>"))
        assertTrue(styles.contains("w:line=\"336\""))
        assertTrue(styles.contains("w:after=\"140\""))
    }

    @Test fun `headings are sized above the body, the title above the headings`() {
        val styles = parts().getValue("word/styles.xml")
        fun sizeOf(id: String) = Regex("w:styleId=\"$id\"[\\s\\S]*?<w:sz w:val=\"(\\d+)\"").find(styles)!!.groupValues[1].toInt()
        assertTrue(sizeOf("Title") > sizeOf("Heading1"))
        assertTrue(sizeOf("Heading1") > sizeOf("Heading2"))
        assertTrue(sizeOf("Heading2") > sizeOf("Heading3"))
        assertTrue(sizeOf("Heading3") >= 24)
    }

    @Test fun `the report's blocks become Word blocks - title, headings, bold and italic, a table with padded cells`() {
        val doc = parts().getValue("word/document.xml")
        assertTrue(doc.contains("w:val=\"Title\""))
        assertTrue(doc.contains("w:val=\"Heading2\""))
        assertTrue(doc.contains("<w:b/>"))
        assertTrue(doc.contains("<w:i/>"))
        assertTrue(doc.contains("<w:tbl>"))
        assertTrue(doc.contains("<w:tblCellMar>"))
        assertTrue(doc.contains(">Hãng<") && doc.contains(">2,26 tr<"))
        assertTrue(doc.contains("•")) // a bullet
        assertTrue(doc.contains(">1. <")) // a numbered item keeps its number
    }

    @Test fun `an https link is clickable, another scheme is only its label`() {
        val p = parts("Xem [BYD](https://byd.com/a) và [x](javascript:alert(1)).")
        assertTrue(p.getValue("word/document.xml").contains("<w:hyperlink"))
        assertTrue(p.getValue("word/_rels/document.xml.rels").contains("Target=\"https://byd.com/a\""))
        assertFalse(p.getValue("word/_rels/document.xml.rels").contains("javascript"))
        assertTrue(p.getValue("word/document.xml").contains(">x<"))
    }

    @Test fun `the footer shows the page number over the page count`() {
        val footer = parts().getValue("word/footer1.xml")
        assertTrue(footer.contains("w:instr=\"PAGE\"") && footer.contains("w:instr=\"NUMPAGES\""))
    }

    @Test fun `text is escaped, so a report with markup characters cannot break the file`() {
        val doc = parts("Giá < 5 & > 3 \"ổn\"").getValue("word/document.xml")
        assertTrue(doc.contains("Giá &lt; 5 &amp; &gt; 3 &quot;ổn&quot;") || doc.contains("Giá &lt; 5 &amp; &gt; 3 \"ổn\""))
        assertFalse(doc.contains("< 5"))
    }

    @Test fun `inline runs - bold, italic, code and https links only`() {
        assertEquals(
            listOf(DocxRun("a "), DocxRun("b", bold = true), DocxRun(" "), DocxRun("c", italic = true), DocxRun(" "), DocxRun("d", code = true), DocxRun(" "), DocxRun("e", link = "https://x.example/"), DocxRun(" "), DocxRun("f")),
            inlineRuns("a **b** *c* `d` [e](https://x.example/) [f](javascript:y)"),
        )
    }
}
