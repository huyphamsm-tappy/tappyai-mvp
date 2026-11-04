package com.tappyai.app.chat

import com.tappyai.app.chat.data.OneBrainFrames
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

// Review 01/11 (Android = the web): the finished Deep Research report as a Word file (.docx), written with java.util.zip only (no library). The
// same look as the web's reportDocx.ts after its 01/11 fix: Calibri 11 pt (covers Vietnamese), lines at about 1.4, room after each paragraph,
// sized headings, bordered and padded table cells, "page / pages" in the footer, https links clickable. Built on the phone from the report
// text; nothing is sent anywhere.

/** One run of inline text: bold, italic, code or an https link (web inlineRuns). */
data class DocxRun(val text: String, val bold: Boolean = false, val italic: Boolean = false, val code: Boolean = false, val link: String? = null)

private val INLINE = Regex("""\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)]\(([^)\s]+)\)""")

/** Inline Markdown as runs: bold, italic, code, links (https only; any other link keeps its label). Pure. */
fun inlineRuns(s: String): List<DocxRun> {
    val out = mutableListOf<DocxRun>()
    var at = 0
    for (m in INLINE.findAll(s)) {
        if (m.range.first > at) out += DocxRun(s.substring(at, m.range.first))
        val g = m.groupValues
        out += when {
            g[1].isNotEmpty() -> DocxRun(g[1], bold = true)
            g[2].isNotEmpty() -> DocxRun(g[2], italic = true)
            g[3].isNotEmpty() -> DocxRun(g[3], code = true)
            OneBrainFrames.isSafeHttpsUrl(g[5]) -> DocxRun(g[4], link = g[5])
            else -> DocxRun(g[4])
        }
        at = m.range.last + 1
    }
    if (at < s.length) out += DocxRun(s.substring(at))
    return out.map { it.copy(text = it.text.replace('\n', ' ')) }.filter { it.text.isNotEmpty() }
}

private sealed interface DBlock {
    data class Heading(val level: Int, val text: String) : DBlock
    data class Para(val text: String) : DBlock
    data class Bullet(val text: String, val depth: Int) : DBlock
    data class Numbered(val n: String, val text: String) : DBlock
    data class Quote(val text: String) : DBlock
    data class Code(val lines: List<String>) : DBlock
    data class Table(val rows: List<List<String>>) : DBlock
    object Rule : DBlock
}

private val HEADING = Regex("""^(#{1,6})\s+(.*)$""")
private val BULLET = Regex("""^(\s*)[-*+]\s+(.*)$""")
private val NUMBERED = Regex("""^(\s*)(\d{1,3})[.)]\s+(.*)$""")
private val RULE = Regex("""^(-{3,}|\*{3,}|_{3,})$""")
private val TABLE_SEPARATOR = Regex("""^\|?\s*:?-{2,}[\s:|-]*$""")

private fun cellsOf(line: String): List<String> = line.trim().removePrefix("|").removeSuffix("|").split('|').map { it.trim() }

private fun parseBlocks(markdown: String): List<DBlock> {
    val lines = markdown.replace(Regex("""\r\n?"""), "\n").split('\n')
    val out = mutableListOf<DBlock>()
    val para = StringBuilder()
    fun flush() { if (para.isNotBlank()) out += DBlock.Para(para.toString().trim()); para.clear() }
    var i = 0
    while (i < lines.size) {
        val t = lines[i].trim()
        when {
            t.isEmpty() -> { flush(); i++ }
            t.startsWith("```") -> {
                flush()
                val code = mutableListOf<String>()
                i++
                while (i < lines.size && !lines[i].trim().startsWith("```")) { code += lines[i]; i++ }
                i++
                out += DBlock.Code(code)
            }
            HEADING.matches(t) -> { flush(); val m = HEADING.find(t)!!; out += DBlock.Heading(m.groupValues[1].length, m.groupValues[2].trim()); i++ }
            t.startsWith("|") && i + 1 < lines.size && TABLE_SEPARATOR.matches(lines[i + 1].trim()) -> {
                flush()
                val rows = mutableListOf<List<String>>()
                var k = i
                while (k < lines.size && lines[k].trim().startsWith("|")) { if (k != i + 1) rows += cellsOf(lines[k]); k++ }
                out += DBlock.Table(rows)
                i = k
            }
            RULE.matches(t) -> { flush(); out += DBlock.Rule; i++ }
            BULLET.matches(lines[i]) -> { flush(); val m = BULLET.find(lines[i])!!; out += DBlock.Bullet(m.groupValues[2].trim(), m.groupValues[1].length / 2); i++ }
            NUMBERED.matches(lines[i]) -> { flush(); val m = NUMBERED.find(lines[i])!!; out += DBlock.Numbered(m.groupValues[2], m.groupValues[3].trim()); i++ }
            t.startsWith(">") -> { flush(); out += DBlock.Quote(t.removePrefix(">").trim()); i++ }
            else -> { if (para.isNotEmpty()) para.append(' '); para.append(t); i++ }
        }
    }
    flush()
    return out
}

// XML 1.0 forbids these control characters (all but tab, line feed, carriage return): one in the text makes Word call the file corrupt.
private val XML_FORBIDDEN = Regex("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]")

private fun esc(s: String) = s.replace(XML_FORBIDDEN, "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

private class Rels {
    val urls = mutableListOf<String>()
    /** rId1 is the styles part and rId2 the footer; hyperlinks start at rId11. */
    fun link(url: String): String { urls += url; return "rId${urls.size + 10}" }
}

private fun runsXml(text: String, rels: Rels, boldAll: Boolean = false): String = inlineRuns(text).joinToString("") { r ->
    // CT_RPr order: rStyle, rFonts, b, i
    val rpr = buildString {
        if (r.link != null) append("<w:rStyle w:val=\"Hyperlink\"/>")
        if (r.code) append("<w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\"/>")
        if (r.bold || boldAll) append("<w:b/>")
        if (r.italic) append("<w:i/>")
    }
    val run = "<w:r>${if (rpr.isEmpty()) "" else "<w:rPr>$rpr</w:rPr>"}<w:t xml:space=\"preserve\">${esc(r.text)}</w:t></w:r>"
    if (r.link != null) "<w:hyperlink r:id=\"${rels.link(r.link)}\">$run</w:hyperlink>" else run
}

private fun para(style: String?, ind: String, inner: String) =
    "<w:p>${if (style == null && ind.isEmpty()) "" else "<w:pPr>${if (style != null) "<w:pStyle w:val=\"$style\"/>" else ""}$ind</w:pPr>"}$inner</w:p>"

private const val TEXT_WIDTH = 9638 // A4 11906 - 2 x 1134 margins, in twentieths of a point

private fun tableXml(rows: List<List<String>>, rels: Rels): String {
    val cols = rows.maxOf { it.size }
    val w = TEXT_WIDTH / cols
    val borders = listOf("top", "left", "bottom", "right", "insideH", "insideV").joinToString("") { "<w:$it w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"BBBBBB\"/>" }
    val grid = "<w:tblGrid>" + (0 until cols).joinToString("") { "<w:gridCol w:w=\"$w\"/>" } + "</w:tblGrid>"
    val trs = rows.mapIndexed { r, cells ->
        "<w:tr>" + (0 until cols).joinToString("") { c ->
            val shade = if (r == 0) "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"EEF2FA\"/>" else ""
            "<w:tc><w:tcPr><w:tcW w:w=\"$w\" w:type=\"dxa\"/>$shade</w:tcPr><w:p><w:pPr><w:spacing w:after=\"0\"/></w:pPr>${runsXml(cells.getOrElse(c) { "" }, rels, boldAll = r == 0)}</w:p></w:tc>"
        } + "</w:tr>"
    }
    val mar = "<w:tblCellMar><w:top w:w=\"80\" w:type=\"dxa\"/><w:left w:w=\"120\" w:type=\"dxa\"/><w:bottom w:w=\"80\" w:type=\"dxa\"/><w:right w:w=\"120\" w:type=\"dxa\"/></w:tblCellMar>"
    return "<w:tbl><w:tblPr><w:tblW w:w=\"$TEXT_WIDTH\" w:type=\"dxa\"/><w:tblBorders>$borders</w:tblBorders><w:tblLayout w:type=\"fixed\"/>$mar</w:tblPr>$grid${trs.joinToString("")}</w:tbl><w:p/>"
}

private const val W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
private const val R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
private const val XML = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"

private fun headingStyle(id: String, name: String, size: Int, before: Int, after: Int, color: String) =
    "<w:style w:type=\"paragraph\" w:styleId=\"$id\"><w:name w:val=\"$name\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/>" +
        "<w:pPr><w:keepNext/><w:spacing w:before=\"$before\" w:after=\"$after\" w:line=\"300\" w:lineRule=\"auto\"/></w:pPr>" +
        "<w:rPr><w:b/><w:color w:val=\"$color\"/><w:sz w:val=\"$size\"/><w:szCs w:val=\"$size\"/></w:rPr></w:style>"

private val STYLES = XML + "<w:styles xmlns:w=\"$W_NS\">" +
    "<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\" w:cs=\"Calibri\" w:eastAsia=\"Calibri\"/><w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/><w:lang w:val=\"vi-VN\"/></w:rPr></w:rPrDefault>" +
    "<w:pPrDefault><w:pPr><w:spacing w:after=\"140\" w:line=\"336\" w:lineRule=\"auto\"/></w:pPr></w:pPrDefault></w:docDefaults>" +
    "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/></w:style>" +
    headingStyle("Title", "Title", 48, 0, 200, "1A3D7C") +
    headingStyle("Heading1", "heading 1", 34, 360, 140, "1A3D7C") +
    headingStyle("Heading2", "heading 2", 28, 300, 120, "1A3D7C") +
    headingStyle("Heading3", "heading 3", 24, 240, 100, "333333") +
    headingStyle("Heading4", "heading 4", 22, 200, 80, "333333") +
    "<w:style w:type=\"character\" w:styleId=\"Hyperlink\"><w:name w:val=\"Hyperlink\"/><w:rPr><w:color w:val=\"1A4FB5\"/><w:u w:val=\"single\"/></w:rPr></w:style>" +
    "</w:styles>"

private val FOOTER = XML + "<w:ftr xmlns:w=\"$W_NS\" xmlns:r=\"$R_NS\"><w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr>" +
    "<w:fldSimple w:instr=\"PAGE\"><w:r><w:rPr><w:color w:val=\"666666\"/><w:sz w:val=\"18\"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>" +
    "<w:r><w:rPr><w:color w:val=\"666666\"/><w:sz w:val=\"18\"/></w:rPr><w:t xml:space=\"preserve\"> / </w:t></w:r>" +
    "<w:fldSimple w:instr=\"NUMPAGES\"><w:r><w:rPr><w:color w:val=\"666666\"/><w:sz w:val=\"18\"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>"

/**
 * The report as a Word file written to [out] (the caller closes it). The report's own "# " title is the document Title; its "##" sections are
 * Heading 1, "###" Heading 2 and deeper Heading 3 (as the web). [title] is used only when the text has no title of its own.
 */
fun writeReportDocx(title: String, markdown: String, out: OutputStream) {
    val rels = Rels()
    val blocks = parseBlocks(markdown).let { b -> if (b.any { it is DBlock.Heading && it.level == 1 }) b else listOf<DBlock>(DBlock.Heading(1, title)) + b }
    val body = blocks.joinToString("") { b ->
        when (b) {
            is DBlock.Heading -> para(if (b.level == 1) "Title" else "Heading${(b.level - 1).coerceAtMost(3)}", "", runsXml(b.text, rels))
            is DBlock.Para -> para(null, "", runsXml(b.text, rels))
            is DBlock.Bullet -> para(null, "<w:ind w:left=\"${360 * (b.depth + 1)}\" w:hanging=\"260\"/>", "<w:r><w:t xml:space=\"preserve\">• </w:t></w:r>" + runsXml(b.text, rels))
            is DBlock.Numbered -> para(null, "<w:ind w:left=\"360\" w:hanging=\"300\"/>", "<w:r><w:t xml:space=\"preserve\">${esc(b.n)}. </w:t></w:r>" + runsXml(b.text, rels))
            is DBlock.Quote -> para(null, "<w:ind w:left=\"400\"/>", runsXml(b.text, rels))
            is DBlock.Code -> b.lines.joinToString("") { l -> "<w:p><w:pPr><w:spacing w:after=\"0\"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii=\"Consolas\" w:hAnsi=\"Consolas\"/></w:rPr><w:t xml:space=\"preserve\">${esc(l)}</w:t></w:r></w:p>" }
            is DBlock.Table -> if (b.rows.isEmpty()) "" else tableXml(b.rows, rels)
            DBlock.Rule -> "<w:p><w:pPr><w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"1\" w:color=\"BBBBBB\"/></w:pBdr></w:pPr></w:p>"
        }
    }
    val document = XML + "<w:document xmlns:w=\"$W_NS\" xmlns:r=\"$R_NS\"><w:body>$body" +
        "<w:sectPr><w:footerReference w:type=\"default\" r:id=\"rId2\"/><w:pgSz w:w=\"11906\" w:h=\"16838\"/>" +
        "<w:pgMar w:top=\"1134\" w:right=\"1134\" w:bottom=\"1134\" w:left=\"1134\" w:header=\"567\" w:footer=\"567\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>"
    val documentRels = XML + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
        "<Relationship Id=\"rId1\" Type=\"$R_NS/styles\" Target=\"styles.xml\"/>" +
        "<Relationship Id=\"rId2\" Type=\"$R_NS/footer\" Target=\"footer1.xml\"/>" +
        rels.urls.mapIndexed { i, u -> "<Relationship Id=\"rId${i + 11}\" Type=\"$R_NS/hyperlink\" Target=\"${esc(u)}\" TargetMode=\"External\"/>" }.joinToString("") +
        "</Relationships>"
    val contentTypes = XML + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
        "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
        "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
        "<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>" +
        "<Override PartName=\"/word/footer1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml\"/></Types>"
    val rootRels = XML + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
        "<Relationship Id=\"rId1\" Type=\"$R_NS/officeDocument\" Target=\"word/document.xml\"/></Relationships>"
    ZipOutputStream(out).use { zip ->
        fun put(name: String, text: String) { zip.putNextEntry(ZipEntry(name)); zip.write(text.toByteArray(Charsets.UTF_8)); zip.closeEntry() }
        put("[Content_Types].xml", contentTypes)
        put("_rels/.rels", rootRels)
        put("word/document.xml", document)
        put("word/styles.xml", STYLES)
        put("word/footer1.xml", FOOTER)
        put("word/_rels/document.xml.rels", documentRels)
    }
}
