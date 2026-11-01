package com.tappyai.app.chat

import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.tappyai.app.chat.data.OneBrainFrames
import com.tappyai.app.chat.data.ResearchChart
import com.tappyai.app.chat.data.ResearchLink
import com.tappyai.core.designsystem.component.markdownVisibleText
import java.io.OutputStream
import java.text.Normalizer
import java.text.NumberFormat
import java.util.Locale

// A5 (02/11): the finished Deep Research report as a file the person keeps (owner 31/10 on the web: "document, pdf và markdown"; Android:
// Markdown and PDF first, Word later). Built on the phone from what is on screen - the report text, the card's https sources, the charts'
// checked figures - and saved where the person chooses; nothing is sent anywhere. A port of the web's reportExport.ts / reportChart.ts.

/** A file name from the report title: letters, digits, spaces and dashes only, at most 60 characters (web reportFileName). */
fun reportFileName(title: String, ext: String): String {
    val base = Normalizer.normalize(title, Normalizer.Form.NFC)
        .replace(Regex("""[^\p{L}\p{N} -]+"""), " ").replace(Regex("""\s+"""), " ").trim().take(60).trim()
    return "${base.ifEmpty { "report" }}.$ext"
}

private fun mdLabel(s: String) = s.replace(Regex("""[\[\]\\\n]"""), " ").replace(Regex("""\s+"""), " ").trim()

/**
 * The report as Markdown: the text as written, with the numbered lines of its LAST section (the sources list the server built, "n. title —
 * site") turned into links to the card's sources of the same number. A number without a safe https link stays as text.
 */
fun reportMarkdown(text: String, links: List<ResearchLink>): String {
    val lines = text.replace(Regex("""\r\n?"""), "\n").split('\n')
    val last = lines.indexOfLast { Regex("""^\s{0,3}#{1,6}\s""").containsMatchIn(it) }
    val byId = links.filter { OneBrainFrames.isSafeHttpsUrl(it.url) }.associateBy { it.id }
    return lines.mapIndexed { i, l ->
        if (i <= last) return@mapIndexed l
        val m = Regex("""^(\d{1,3})\.\s+(.*)$""").find(l) ?: return@mapIndexed l
        val link = byId[m.groupValues[1].toInt()] ?: return@mapIndexed l
        // a "(" or ")" in the address ends it early in every reader of [label](address); %28 / %29 is the same address
        "${m.groupValues[1]}. [${mdLabel(link.title).ifEmpty { mdLabel(m.groupValues[2]) }}](${link.url.replace("(", "%28").replace(")", "%29")})"
    }.joinToString("\n").trim() + "\n"
}

/** A figure as the report's language writes it (web formatValue: vi-VN / en-US, at most 2 decimals). */
fun formatValue(v: Double, lang: String): String =
    NumberFormat.getNumberInstance(if (lang == "vi") Locale("vi", "VN") else Locale.US).apply { maximumFractionDigits = 2 }.format(v)

/** One chart's figures as a Markdown table with its caption; each value keeps its source number (web chartTable). */
fun chartTable(c: ResearchChart, lang: String): String {
    fun cell(s: String) = s.replace('|', '/').replace('\n', ' ')
    val rows = c.points.joinToString("\n") { p -> "| ${cell(p.label)} | ${formatValue(p.value, lang)}${if (c.unit.isNotEmpty()) " ${cell(c.unit)}" else ""} [${p.source}] |" }
    val head = if (lang == "vi") "| Mục | Giá trị |" else "| Item | Value |"
    val caption = "*${if (lang == "vi") "Biểu đồ" else "Chart"}: ${cell(c.title)}*"
    return "$head\n|---|---|\n$rows\n\n$caption"
}

/** The report with each chart's figures as a table right under its section heading; a chart whose heading is not there is left out. */
fun withChartTables(text: String, charts: List<ResearchChart>, lang: String): String {
    if (charts.isEmpty()) return text
    val left = LinkedHashMap<String, ResearchChart>().apply { for (c in charts) putIfAbsent(titleKey(c.section), c) }
    return text.split('\n').joinToString("\n") { line ->
        val h = Regex("""^\s{0,3}#{2,6}\s+(.+?)\s*#*\s*$""").find(line) ?: return@joinToString line
        val key = titleKey(cleanTitle(h.groupValues[1]))
        val c = left.remove(key) ?: return@joinToString line
        "$line\n\n${chartTable(c, lang)}\n"
    }
}

/** One block of the PDF: a heading (level 1-3) or body text (0), as the reader sees it - no Markdown marks; [rows] is set for a table (header first). */
data class PdfBlock(val level: Int, val text: String, val rows: List<List<String>>? = null)

/** The PDF's look (review 01/11: the web's 16 px / 1.75 reads at about 12 pt / 1.5 on A4): sizes in points, gaps in points. */
internal object PdfStyle {
    const val PAGE_W = 595
    const val PAGE_H = 842
    const val MARGIN = 56
    const val TITLE = 26f
    const val H1 = 22f
    const val H2 = 18f
    const val H3 = 15f
    const val BODY = 12f
    const val LINE_MULT = 1.5f
    const val GAP_BODY = 12
    const val GAP_HEAD = 8
    const val GAP_TITLE = 20
    const val BEFORE_H1 = 22
    const val BEFORE_H2 = 16
    const val BEFORE_H3 = 12
    const val FOOTER_H = 30
    const val CELL_PAD = 6
}

/** True when a heading drawn at [y] would be left alone at the bottom of the page: it needs room for itself and two lines of what follows. */
internal fun keepHeadingWithNext(y: Int, headingH: Int, nextLineH: Int, bottom: Int): Boolean = y + headingH + 2 * nextLineH > bottom

/** The footer of a page: "n / N" (the web prints the same). */
internal fun pageLabel(n: Int, total: Int): String = "$n / $total"

private val NUMBERED_LINK = Regex("""^(\d{1,3})\. \[(.*)]\((https://[^)\s]+)\)$""")

/**
 * The report for the PDF: the sources list (the last section) keeps each address in view ("n. title — https://…"), because a PDF page has no link
 * to tap and the web's printed page keeps its links. A source without a safe https address stays as it was.
 */
fun reportForPdf(text: String, links: List<ResearchLink>): String {
    val lines = reportMarkdown(text, links).split('\n')
    val last = lines.indexOfLast { Regex("""^\s{0,3}#{1,6}\s""").containsMatchIn(it) }
    return lines.mapIndexed { i, l ->
        if (i <= last) return@mapIndexed l
        val m = NUMBERED_LINK.find(l) ?: return@mapIndexed l
        "${m.groupValues[1]}. ${m.groupValues[2]} — ${m.groupValues[3]}"
    }.joinToString("\n")
}

private val TABLE_SEPARATOR = Regex("""^\|?\s*:?-{2,}[\s:|-]*$""")

/** The rows of a Markdown table chunk (separator row dropped, marks stripped), or null when the chunk is not a table. */
private fun tableRowsOf(chunk: String): List<List<String>>? {
    val lines = chunk.split('\n').map { it.trim() }
    if (lines.size < 2 || !lines.all { it.startsWith("|") } || !TABLE_SEPARATOR.matches(lines[1])) return null
    return lines.filterIndexed { i, _ -> i != 1 }.map { l ->
        l.removePrefix("|").removeSuffix("|").split('|').map { markdownVisibleText(it.trim()).trim() }
    }
}

private val HEADING_LINE = Regex("""^\s{0,3}#{1,6}\s""")

/**
 * A chunk written without blank lines around its heading or table (review 02/11): the heading line is a block of its own (it used to make
 * the whole list under it a heading), and a table starting under a sentence is a block of its own (it used to be drawn as tabbed text).
 * A chunk holding a fence is left whole.
 */
private fun splitAtHeadingsAndTables(chunk: String): List<String> {
    if (chunk.contains("```")) return listOf(chunk)
    val out = mutableListOf<String>()
    val buf = mutableListOf<String>()
    fun flush() { if (buf.isNotEmpty()) { out += buf.joinToString("\n"); buf.clear() } }
    var inTable = false
    for (line in chunk.split('\n')) {
        val isHeading = HEADING_LINE.containsMatchIn(line)
        val isTableLine = line.trimStart().startsWith("|")
        if (isHeading || isTableLine != inTable) flush()
        inTable = isTableLine
        buf += line
        if (isHeading) flush()
    }
    flush()
    return out
}

/** The report cut into blocks at blank lines (a fenced code block stays whole), each read through the chat's own Markdown reader. */
fun pdfBlocks(markdown: String): List<PdfBlock> {
    val chunks = mutableListOf<String>()
    val buf = StringBuilder()
    var inFence = false
    for (line in markdown.replace(Regex("""\r\n?"""), "\n").split('\n')) {
        if (line.trimStart().startsWith("```")) inFence = !inFence
        if (line.isBlank() && !inFence) { if (buf.isNotEmpty()) { chunks += buf.toString(); buf.clear() }; continue }
        if (buf.isNotEmpty()) buf.append('\n')
        buf.append(line)
    }
    if (buf.isNotEmpty()) chunks += buf.toString()
    return chunks.flatMap(::splitAtHeadingsAndTables).mapNotNull { chunk ->
        tableRowsOf(chunk)?.let { rows -> return@mapNotNull PdfBlock(0, rows.joinToString("\n") { it.joinToString("\t") }, rows) }
        val text = visibleKeepingAddresses(chunk).trim().takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        val level = Regex("""^\s{0,3}(#{1,6})\s""").find(chunk)?.groupValues?.get(1)?.length?.coerceAtMost(3) ?: 0
        PdfBlock(level, text)
    }
}

private val STANDALONE_URL = Regex("""(?<![(])https?://[^\s)\]]+""")
private val URL_SLOT = Regex("""ZZURL(\d+)ZZ""")

/**
 * The chunk as the reader sees it, except that an address standing on its own stays an address: the chat's reader turns a bare address into the
 * name of its site (right on a screen where it is a link, wrong on paper where it is not - seen on the emulator: a PDF whose sources read
 * "n. title - tilleke.com" and no address). A [label](address) in prose still reads as its label.
 */
private fun visibleKeepingAddresses(chunk: String): String {
    val urls = mutableListOf<String>()
    val masked = STANDALONE_URL.replace(chunk) { m -> urls += m.value; "ZZURL${urls.size - 1}ZZ" }
    return URL_SLOT.replace(markdownVisibleText(masked)) { urls.getOrElse(it.groupValues[1].toInt()) { "" } }
}

private fun pdfPaint(size: Float, bold: Boolean, color: Int = Color.BLACK) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = size
    typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    this.color = color
}

private fun pdfLayout(text: String, p: TextPaint, width: Int): StaticLayout =
    StaticLayout.Builder.obtain(text, 0, text.length, p, width).setLineSpacing(0f, PdfStyle.LINE_MULT).setAlignment(Layout.Alignment.ALIGN_NORMAL).build()

/**
 * Lays the report out on A4 pages. With [doc] null it only counts the pages (the first pass: the footer needs "n / N"); with a document it draws
 * them. Review 01/11: body 12 pt at 1.5, room between blocks, a heading kept with what follows, bordered tables with a filled header row.
 */
private class PdfWriter(private val doc: PdfDocument?, private val total: Int) {
    var pages = 0
        private set
    private var page: PdfDocument.Page? = null
    private var y = PdfStyle.MARGIN
    private val width = PdfStyle.PAGE_W - 2 * PdfStyle.MARGIN
    private val bottom = PdfStyle.PAGE_H - PdfStyle.MARGIN - PdfStyle.FOOTER_H
    private val bodyLineH = pdfLayout("Ag", pdfPaint(PdfStyle.BODY, false), width).height

    private fun newPage() {
        finishPage()
        pages++
        if (doc != null) page = doc.startPage(PdfDocument.PageInfo.Builder(PdfStyle.PAGE_W, PdfStyle.PAGE_H, pages).create())
        y = PdfStyle.MARGIN
    }

    private fun finishPage() {
        val p = page ?: return
        val f = pdfPaint(10f, false, 0xFF666666.toInt())
        val label = pageLabel(pages, total)
        p.canvas.drawText(label, (PdfStyle.PAGE_W - f.measureText(label)) / 2f, (PdfStyle.PAGE_H - PdfStyle.MARGIN + 6).toFloat(), f)
        doc!!.finishPage(p)
        page = null
    }

    fun finish() = finishPage()

    private fun slice(layout: StaticLayout, first: Int, last: Int, x: Int) {
        val canvas = page?.canvas ?: return
        canvas.save()
        canvas.translate(x.toFloat(), (y - layout.getLineTop(first)).toFloat())
        canvas.clipRect(0, layout.getLineTop(first), width, layout.getLineBottom(last))
        layout.draw(canvas)
        canvas.restore()
    }

    /** A block of text, drawn line by line so it can run over a page break; a heading ([keepNext]) never ends a page alone. */
    private fun text(text: String, p: TextPaint, gapAfter: Int, before: Int = 0, keepNext: Boolean = false) {
        if (pages == 0) newPage()
        val layout = pdfLayout(text, p, width)
        if (before > 0 && y > PdfStyle.MARGIN) y += before
        if (keepNext && y > PdfStyle.MARGIN && keepHeadingWithNext(y, layout.height, bodyLineH, bottom)) newPage()
        var line = 0
        while (line < layout.lineCount) {
            if (y + (layout.getLineBottom(line) - layout.getLineTop(line)) > bottom) newPage()
            var last = line
            while (last + 1 < layout.lineCount && y + (layout.getLineBottom(last + 1) - layout.getLineTop(line)) <= bottom) last++
            slice(layout, line, last, PdfStyle.MARGIN)
            y += layout.getLineBottom(last) - layout.getLineTop(line)
            line = last + 1
        }
        y += gapAfter
    }

    /** A table as a grid: equal columns, a filled bold header row, a thin border round every cell, a row never split over a page. */
    private fun table(rows: List<List<String>>) {
        if (pages == 0) newPage()
        val cols = rows.maxOf { it.size }
        val colW = width / cols
        val pad = PdfStyle.CELL_PAD
        val line = Paint().apply { style = Paint.Style.STROKE; strokeWidth = 0.7f; color = 0xFFBBBBBB.toInt() }
        val fill = Paint().apply { style = Paint.Style.FILL; color = 0xFFEEF2FA.toInt() }
        rows.forEachIndexed { r, cells ->
            val p = pdfPaint(PdfStyle.BODY - 1f, r == 0)
            val layouts = (0 until cols).map { c -> pdfLayout(cells.getOrElse(c) { "" }, p, colW - 2 * pad) }
            val rowH = layouts.maxOf { it.height } + 2 * pad
            if (y + rowH > bottom && y > PdfStyle.MARGIN) newPage()
            val canvas = page?.canvas
            if (canvas != null) {
                for (c in 0 until cols) {
                    val x = PdfStyle.MARGIN + c * colW
                    val rect = floatArrayOf(x.toFloat(), y.toFloat(), (x + colW).toFloat(), (y + rowH).toFloat())
                    if (r == 0) canvas.drawRect(rect[0], rect[1], rect[2], rect[3], fill)
                    canvas.drawRect(rect[0], rect[1], rect[2], rect[3], line)
                    canvas.save()
                    canvas.translate((x + pad).toFloat(), (y + pad).toFloat())
                    layouts[c].draw(canvas)
                    canvas.restore()
                }
            }
            y += rowH
        }
        y += PdfStyle.GAP_BODY
    }

    fun render(title: String, blocks: List<PdfBlock>) {
        text(title, pdfPaint(PdfStyle.TITLE, true), PdfStyle.GAP_TITLE)
        for (b in blocks) {
            val rows = b.rows
            when {
                rows != null && rows.isNotEmpty() -> table(rows)
                // the report's own "# " title is the document title already drawn above
                b.level == 1 && b.text.trim().equals(title.trim(), ignoreCase = true) -> Unit
                b.level == 1 -> text(b.text, pdfPaint(PdfStyle.H1, true), PdfStyle.GAP_HEAD, PdfStyle.BEFORE_H1, keepNext = true)
                b.level == 2 -> text(b.text, pdfPaint(PdfStyle.H2, true), PdfStyle.GAP_HEAD, PdfStyle.BEFORE_H2, keepNext = true)
                b.level == 3 -> text(b.text, pdfPaint(PdfStyle.H3, true), PdfStyle.GAP_HEAD, PdfStyle.BEFORE_H3, keepNext = true)
                else -> text(b.text, pdfPaint(PdfStyle.BODY, false), PdfStyle.GAP_BODY)
            }
        }
    }
}

/** The report as an A4 PDF: the title, then each block, pages as needed, "n / N" at the foot. Written to [out]; the caller closes it. */
fun writeReportPdf(title: String, markdown: String, out: OutputStream) {
    val blocks = pdfBlocks(markdown)
    val total = PdfWriter(null, 0).also { it.render(title, blocks) }.pages
    val doc = PdfDocument()
    PdfWriter(doc, total).also { it.render(title, blocks); it.finish() }
    doc.writeTo(out)
    doc.close()
}
