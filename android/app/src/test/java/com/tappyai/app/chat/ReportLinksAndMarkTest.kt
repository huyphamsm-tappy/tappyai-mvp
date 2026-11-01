package com.tappyai.app.chat

import com.tappyai.app.chat.data.ResearchLink
import com.tappyai.core.designsystem.component.markdownVisibleText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipInputStream

/** Review 02/11 (Android): addresses with a ")" in them, control characters in a Word file, and an underscore inside a word. */
class ReportLinksAndMarkTest {
    private val wiki = "https://vi.wikipedia.org/wiki/Hà_Nội_(thành_phố)"

    // A "(" or ")" in an address ended it early in every reader of a [label](address): the chat cut the link, the PDF lost the address
    // (and kept a stray ")"), and Word linked to a broken address. The written address escapes them (%28 %29), which is the same address.
    @Test fun `the report writes an address with brackets so every reader keeps it whole`() {
        val md = reportMarkdown("# T\n\ntext\n\n## Nguồn\n\n1. Hà Nội — vi.wikipedia.org\n", listOf(ResearchLink(1, "Hà Nội", wiki)))
        assertTrue(md, md.contains("(https://vi.wikipedia.org/wiki/Hà_Nội_%28thành_phố%29)"))
        val pdf = reportForPdf("# T\n\ntext\n\n## Nguồn\n\n1. Hà Nội — vi.wikipedia.org\n", listOf(ResearchLink(1, "Hà Nội", wiki)))
        assertTrue(pdf, pdf.contains("1. Hà Nội — https://vi.wikipedia.org/wiki/Hà_Nội_%28thành_phố%29"))
    }

    @Test fun `the chat reads a link whose address has brackets as one link`() {
        assertEquals("Hà Nội", markdownVisibleText("[Hà Nội]($wiki)"))
        assertEquals("xem Foo rồi tiếp", markdownVisibleText("xem [Foo](https://x.org/Foo_(bar)) rồi tiếp"))
    }

    // XML 1.0 forbids most control characters; one inside the report (it comes from web pages through the model) makes Word call the file corrupt.
    @Test fun `a control character in the report does not corrupt the Word file`() {
        val out = ByteArrayOutputStream()
        writeReportDocx("Báo cáo", "# Báo cáo\n\nCó ký tự \u0001 và \u000B và \u0000 lạ.\n", out)
        val zip = ZipInputStream(ByteArrayInputStream(out.toByteArray()))
        val xml = generateSequence { zip.nextEntry }.map { it.name to zip.readBytes().toString(Charsets.UTF_8) }.toMap().getValue("word/document.xml")
        assertFalse(xml.any { it.code < 0x20 && it != '\t' && it != '\n' && it != '\r' })
        assertTrue(xml.contains("Có ký tự"))
    }

    // pdfBlocks cut the report only at blank lines, so a heading written right above its list made the whole list a heading (bold, 15 pt),
    // and a table written right under a sentence was drawn as text with tabs instead of a grid.
    @Test fun `a heading or a table without a blank line around it is still its own block`() {
        val heading = pdfBlocks("### Ngày 1\n- mục a\n- mục b")
        assertEquals(2, heading.size)
        assertEquals(PdfBlock(3, "Ngày 1"), heading[0])
        assertEquals(0, heading[1].level)
        assertTrue(heading[1].text.contains("mục a") && heading[1].text.contains("mục b"))

        val table = pdfBlocks("Bảng giá:\n| Mẫu | Giá |\n|---|---|\n| VF 3 | 240 |")
        assertEquals(2, table.size)
        assertEquals("Bảng giá:", table[0].text)
        assertEquals(listOf(listOf("Mẫu", "Giá"), listOf("VF 3", "240")), table[1].rows)

        // a fenced block stays whole
        assertEquals(1, pdfBlocks("```\n# not a heading\n| a | b |\n```").size)
    }

    // CommonMark: an underscore inside a word is just an underscore ("ABC_123 … XYZ_456" was italic and lost its marks).
    @Test fun `an underscore inside a word is not emphasis`() {
        assertEquals("Mã ABC_123 và XYZ_456 hết", markdownVisibleText("Mã ABC_123 và XYZ_456 hết"))
        assertEquals("vnexpress.net/tin_a_b", markdownVisibleText("vnexpress.net/tin_a_b"))
        assertEquals("nghiêng", markdownVisibleText("_nghiêng_"))
        assertEquals("nghiêng", markdownVisibleText("*nghiêng*"))
        assertEquals("5 * 3 * 2", markdownVisibleText("5 * 3 * 2"))
    }
}
