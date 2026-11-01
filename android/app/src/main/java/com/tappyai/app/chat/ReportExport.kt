package com.tappyai.app.chat

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
        "${m.groupValues[1]}. [${mdLabel(link.title).ifEmpty { mdLabel(m.groupValues[2]) }}](${link.url})"
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

/** One block of the PDF: a heading (level 1-3) or body text (0), as the reader sees it - no Markdown marks. */
data class PdfBlock(val level: Int, val text: String)

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
    return chunks.mapNotNull { chunk ->
        val text = markdownVisibleText(chunk).trim().takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        val level = Regex("""^\s{0,3}(#{1,6})\s""").find(chunk)?.groupValues?.get(1)?.length?.coerceAtMost(3) ?: 0
        PdfBlock(level, text)
    }
}

/** The report as an A4 PDF: the title, then each block (headings bold and larger), pages as needed. Written to [out]; the caller closes it. */
fun writeReportPdf(title: String, markdown: String, out: OutputStream) {
    val pageW = 595; val pageH = 842; val margin = 48
    val width = pageW - 2 * margin
    val doc = PdfDocument()
    var page: PdfDocument.Page? = null
    var y = 0
    var number = 0
    fun newPage() {
        page?.let(doc::finishPage)
        page = doc.startPage(PdfDocument.PageInfo.Builder(pageW, pageH, ++number).create())
        y = margin
    }
    fun paint(size: Float, bold: Boolean) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size
        typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }
    fun draw(text: String, p: TextPaint, gapAfter: Int) {
        val layout = StaticLayout.Builder.obtain(text, 0, text.length, p, width).setAlignment(Layout.Alignment.ALIGN_NORMAL).build()
        var line = 0
        while (line < layout.lineCount) {
            if (page == null || y + (layout.getLineBottom(line) - layout.getLineTop(line)) > pageH - margin) newPage()
            // the lines that fit on this page, drawn as one slice of the layout
            var last = line
            while (last + 1 < layout.lineCount && y + (layout.getLineBottom(last + 1) - layout.getLineTop(line)) <= pageH - margin) last++
            val canvas = page!!.canvas
            canvas.save()
            canvas.translate(margin.toFloat(), (y - layout.getLineTop(line)).toFloat())
            canvas.clipRect(0, layout.getLineTop(line), width, layout.getLineBottom(last))
            layout.draw(canvas)
            canvas.restore()
            y += layout.getLineBottom(last) - layout.getLineTop(line)
            line = last + 1
        }
        y += gapAfter
    }
    newPage()
    draw(title, paint(20f, true), 16)
    for (b in pdfBlocks(markdown)) {
        when (b.level) {
            1 -> draw(b.text, paint(17f, true), 10)
            2 -> draw(b.text, paint(15f, true), 8)
            3 -> draw(b.text, paint(13f, true), 6)
            else -> draw(b.text, paint(11f, false), 8)
        }
    }
    page?.let(doc::finishPage)
    doc.writeTo(out)
    doc.close()
}
