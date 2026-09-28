package com.tappyai.core.designsystem.component

/**
 * No literal "**" in any answer, any vertical (owner UAT blocker 2026-09-28).
 *
 * Mirrors web `src/lib/chat/markdownNormalize.ts` (`balanceBold` / `plainText`) — same rules, same
 * cases pinned on both sides. [TappyMarkdown] used to emit any unterminated `**` LITERALLY (its
 * inline scan appends a marker it cannot close), so a model slip ("**4.7⭐"), half a pair left by a
 * guard that cut a sentence, or a pair split by a line break all reached the screen as asterisks;
 * and every card that renders a model string as plain text printed the markdown raw.
 *
 * Pure Kotlin, no Compose — unit-testable from any module.
 */
object MarkdownNormalize {
    private val STAR_RUN = Regex("""\*{2,}""")

    private class Tok(val start: Int, val end: Int, val canOpen: Boolean, val canClose: Boolean) {
        val empty get() = end - start >= 4
    }

    /**
     * Balance bold on ONE line: matched pairs survive (as canonical `**`), every unmatched `**` is
     * dropped. A run of 3 counts as one delimiter; a run of 4+ is an empty pair and goes. Pairing
     * is flanking-aware, inner padding is trimmed ("** text**" → "**text**"), empty pairs vanish.
     */
    fun balanceBold(line: String): String {
        if (!line.contains("**")) return line
        val toks = STAR_RUN.findAll(line).map { m ->
            val start = m.range.first
            val end = m.range.last + 1
            if (end - start >= 4) {
                Tok(start, end, canOpen = false, canClose = false)
            } else {
                val after = line.getOrNull(end)
                val before = line.getOrNull(start - 1)
                Tok(start, end, canOpen = after != null && !after.isWhitespace(), canClose = before != null && !before.isWhitespace())
            }
        }.toList()
        val closeOf = HashMap<Tok, Tok>()
        var pending: Tok? = null
        for (t in toks) {
            if (t.empty) continue
            val neither = !t.canOpen && !t.canClose
            val p = pending
            if (p == null) {
                if (t.canOpen || neither) pending = t
            } else if (t.canClose || neither) {
                closeOf[p] = t; pending = null
            } else {
                pending = t
            }
        }
        val out = StringBuilder()
        var at = 0
        var k = 0
        while (k < toks.size) {
            val t = toks[k]
            val close = closeOf[t]
            if (close != null) {
                out.append(line, at, t.start)
                val inner = STAR_RUN.replace(line.substring(t.end, close.start), "").trim()
                if (inner.isNotEmpty()) out.append("**").append(inner).append("**")
                at = close.end
                if (inner.isEmpty() && t.start > 0 && line[t.start - 1].isWhitespace() && line.getOrNull(at) == ' ') at++
                k = toks.indexOf(close) + 1
                continue
            }
            out.append(line, at, t.start)
            at = t.end
            if (t.start > 0 && line[t.start - 1].isWhitespace() && line.getOrNull(at) == ' ') at++
            k++
        }
        out.append(line, at, line.length)
        return out.toString()
    }

    /** [balanceBold] on every line — bold never spans a line break in either client. */
    private val GLUED_LINKS = Regex("""(\]\([^)\s]+\))(?=\[[^\]]*\]\()""")

    /**
     * "[Official Website](u)[Google Maps](v)" — the server emits a place's links back to back, and
     * rendered as-is they read "Official WebsiteGoogle Maps" (golden M1/T1, 2026-09-28). Put a
     * " · " between two adjacent LINKS; images (`![…](…)`) are left alone.
     */
    fun separateGluedLinks(text: String): String =
        if (!text.contains(")[")) text else GLUED_LINKS.replace(text) { it.groupValues[1] + " · " }

    /** Everything the renderer normalises before parsing blocks. */
    fun forRender(text: String): String = balanceBoldPerLine(separateGluedLinks(text))

    fun balanceBoldPerLine(text: String): String =
        if (!text.contains("**")) text else text.split("\n").joinToString("\n") { balanceBold(it) }

    private val MD_LINK = Regex("""!?\[([^\]\n]*)\]\([^)\s]*\)""")
    private val DOUBLE_UNDERSCORE = Regex("""(^|[\s(])__(?=\S)|(?<=\S)__(?=[\s).,;:!?]|$)""")
    private val HEADING = Regex("""(^|\n)\s*#{1,6}\s+""")
    private val SINGLE_STAR = Regex("""(^|[\s(])\*(?=\S)|(?<=\S)\*(?=[\s).,;:!?]|$)""")
    private val SINGLE_UNDERSCORE = Regex("""(^|[\s(])_(?=[^\s_])([^_\n]+?)_(?=[\s).,;:!?]|$)""")
    private val SPACES = Regex("""[ \t]{2,}""")
    private val MD_CHARS = Regex("""[*_`#\[]""")

    /**
     * Markdown-free text for a card field that renders a model string as PLAIN text (plan items,
     * shopping names, place reasons, CTA labels, follow-up chips). Never touches "2*3".
     */
    fun plainText(s: String): String {
        if (s.isEmpty() || !MD_CHARS.containsMatchIn(s)) return s
        var t = MD_LINK.replace(s) { it.groupValues[1] }
        t = STAR_RUN.replace(t, "")
        t = DOUBLE_UNDERSCORE.replace(t) { it.groupValues[1] }
        t = t.replace("`", "")
        t = HEADING.replace(t) { it.groupValues[1] }
        t = SINGLE_STAR.replace(t) { it.groupValues[1] }
        t = SINGLE_UNDERSCORE.replace(t) { it.groupValues[1] + it.groupValues[2] }
        return SPACES.replace(t, " ").trim()
    }
}
