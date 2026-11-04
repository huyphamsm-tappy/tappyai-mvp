package com.tappyai.app.chat

import com.tappyai.app.chat.data.DocMediaItem
import com.tappyai.app.chat.data.ResearchChart
import java.text.Normalizer

// A4 (02/11): the answer's pictures and charts placed under their sections - a port of the web's article layout (web branch f4b07d2:
// src/lib/answerDoc/parse.ts titleKey / cleanTitle / headingTitle / listItemTitle, src/components/chat/ArticleAnswer.tsx assignPictures).
// The server chose and checked every picture and figure; the client only finds the heading (or bold-lead item) each one names.

/** One piece of a laid-out answer, in reading order. */
sealed interface ArticlePart {
    data class Markdown(val text: String) : ArticlePart
    data class Picture(val item: DocMediaItem) : ArticlePart
    data class Chart(val chart: ResearchChart) : ArticlePart
}

/** The web's titleKey: accents, đ, case and punctuation aside, so a title matches in any script. */
fun titleKey(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFKD)
    .replace(Regex("""\p{M}+"""), "")
    .replace('đ', 'd').replace('Đ', 'd')
    .lowercase()
    .replace(Regex("""[^\p{L}\p{N}]+"""), " ")
    .trim()

private val LEAD_SYMBOLS = Regex("""^[\s\p{So}\p{Sk}\p{Sm}\p{Sc}\x{FE0F}\x{200D}]+""")
private val LEAD_NUMBER = Regex("""^\d{1,3}[.)]\s*""")
private val TITLE_CUT = Regex("""\s*[:：]\s+|\s+[–—-]\s+|\s+\(|\s+\|\s+|[:：]\s*$""")
private val LEAD_BOLD = Regex("""^\s*(?:\d{1,3}[.)]\s*)?\*\*(.+?)\*\*""")
private val HEADING = Regex("""^\s{0,3}#{1,6}\s+(.*)$""")
private val LIST_ITEM = Regex("""^\s*(?:[-*•]|\d{1,3}[.)])\s+(.*)$""")

/** A title's own words: no leading number / emoji / symbol, cut at the first separator (web cleanTitle). */
internal fun cleanTitle(s: String): String = s.replace("**", "")
    .replace(LEAD_SYMBOLS, "").replace(LEAD_NUMBER, "").replace(LEAD_SYMBOLS, "")
    .split(TITLE_CUT)[0]
    .replace(Regex("""[\s.,;:!?：]+$"""), "")
    .trim()

private fun okTitle(t: String) = t.length in 2..60 && t.split(Regex("""\s+""")).size <= 8

private fun headingTitle(line: String): String? = HEADING.find(line)?.groupValues?.get(1)?.let(::cleanTitle)?.takeIf(::okTitle)

private fun listItemTitle(line: String): String? {
    val body = LIST_ITEM.find(line)?.groupValues?.get(1) ?: return null
    return LEAD_BOLD.find(body)?.groupValues?.get(1)?.let(::cleanTitle)?.takeIf(::okTitle)
}

/**
 * The answer's text split at the headings and bold-lead items that have a chart or a picture, each placed right after its line. A chart
 * wins its section, and a charted title gets no picture (web: the server drops it, the client does not show it); each is used once;
 * a picture or chart whose title is nowhere is not shown. [texts] are the reply's text pieces in order (its markdown segments).
 */
fun placeArticle(texts: List<String>, media: List<DocMediaItem>, charts: List<ResearchChart>): List<ArticlePart> {
    val placer = ArticlePlacer(media, charts)
    return texts.flatMap(placer::place)
}

/** [placeArticle] one text piece at a time (a reply's markdown segments sit between its photo strips); each picture / chart is used once. */
class ArticlePlacer(media: List<DocMediaItem>, charts: List<ResearchChart>) {
    private val chartBy = LinkedHashMap<String, ResearchChart>().apply { for (c in charts) titleKey(c.section).takeIf { it.isNotEmpty() }?.let { putIfAbsent(it, c) } }
    private val picBy = LinkedHashMap<String, DocMediaItem>().apply { for (m in media) titleKey(m.title).takeIf { it.isNotEmpty() && it !in chartBy }?.let { putIfAbsent(it, m) } }

    fun place(text: String): List<ArticlePart> {
        if (text.isEmpty()) return emptyList()
        if (chartBy.isEmpty() && picBy.isEmpty()) return listOf(ArticlePart.Markdown(text))
        val out = mutableListOf<ArticlePart>()
        val buf = StringBuilder()
        val lines = text.split('\n')
        for ((i, line) in lines.withIndex()) {
            buf.append(line)
            if (i < lines.size - 1) buf.append('\n')
            val key = (headingTitle(line) ?: listItemTitle(line))?.let(::titleKey) ?: continue
            val placed: ArticlePart = chartBy.remove(key)?.let { ArticlePart.Chart(it) } ?: picBy.remove(key)?.let { ArticlePart.Picture(it) } ?: continue
            out += ArticlePart.Markdown(buf.toString())
            buf.clear()
            out += placed
        }
        if (buf.isNotEmpty()) out += ArticlePart.Markdown(buf.toString())
        return out
    }
}
