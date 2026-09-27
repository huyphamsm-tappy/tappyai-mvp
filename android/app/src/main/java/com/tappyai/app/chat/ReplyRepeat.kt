package com.tappyai.app.chat

import java.text.Normalizer

/**
 * One reply, not two (UAT3, 2026-09-27) — a line-for-line port of web `src/lib/chat/replyRepeat.ts`.
 *
 * Measured on a Galaxy A12: a clarify turn was saved as two slightly different versions of the same
 * reply back to back. The server's stream guard drops a repeated STEP; this runs on the finished
 * reply before it is parsed, shown and saved, and catches a repeat inside one streamed step, which a
 * stream cannot take back. Same thresholds and the same cases as the web tests (ReplyRepeatTest).
 */
internal object ReplyRepeat {
    const val REPEAT_SIMILARITY = 0.8
    private const val MIN_PROSE = 60
    private val BLOCK = Regex("""\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[/\1\]""", RegexOption.IGNORE_CASE)
    private val MARKS = Regex("""\p{Mn}+""")
    private val NON_WORD = Regex("[^a-z0-9]+")

    private fun tokens(s: String): List<String> {
        val folded = MARKS.replace(Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD), "").replace('đ', 'd')
        return NON_WORD.replace(BLOCK.replace(folded, " "), " ").trim().split(' ').filter { it.isNotEmpty() }
    }

    /** Dice coefficient over word bigrams (unigrams for very short text). */
    fun similarity(a: String, b: String): Double {
        val ta = tokens(a)
        val tb = tokens(b)
        if (ta.isEmpty() || tb.isEmpty()) return 0.0
        fun grams(t: List<String>): Map<String, Int> {
            val n = if (t.size < 3) 1 else 2
            val m = HashMap<String, Int>()
            for (i in 0..t.size - n) m.merge(t.subList(i, i + n).joinToString(" "), 1, Int::plus)
            return m
        }
        val ga = grams(ta)
        val gb = grams(tb)
        val inter = ga.entries.sumOf { (g, v) -> minOf(v, gb[g] ?: 0) }
        return 2.0 * inter / (ga.values.sum() + gb.values.sum())
    }

    /** The same reply twice in one text → the last version; anything else unchanged. */
    fun dropRepeatedReply(text: String): String {
        val t = text.trimStart()
        if (t.length < MIN_PROSE * 2) return text
        val opening = t.substring(0, 40)
        var at = t.indexOf(opening, 40)
        while (at != -1) {
            val first = t.substring(0, at)
            val second = t.substring(at)
            if (first.trim().length >= MIN_PROSE && similarity(first, second) >= REPEAT_SIMILARITY) return second
            at = t.indexOf(opening, at + 1)
        }
        return text
    }
}
